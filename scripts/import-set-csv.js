import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import { parse } from "csv-parse";
import { slugify } from "../lib/cards.js";

const { redis } = await import("../lib/redis.js");

const [, , csvPath, rawSetCode] = process.argv;

if (!csvPath || !rawSetCode) {
    console.error(
        "Usage: node scripts/import-set-csv.js ./data/products/msh/scryfall-msh.csv msh"
    );
    process.exit(1);
}

const setCode = rawSetCode.toLowerCase();

function normalizeRarity(value) {
    const rarity = String(value || "").trim().toLowerCase();

    const map = {
        c: "common",
        common: "common",
        u: "uncommon",
        uncommon: "uncommon",
        r: "rare",
        rare: "rare",
        m: "mythic",
        mythic: "mythic"
    };

    return map[rarity] || rarity;
}

function parseColorsFromManaCost(manaCost = "") {
    const colors = new Set();

    if (manaCost.includes("{W}")) colors.add("W");
    if (manaCost.includes("{U}")) colors.add("U");
    if (manaCost.includes("{B}")) colors.add("B");
    if (manaCost.includes("{R}")) colors.add("R");
    if (manaCost.includes("{G}")) colors.add("G");

    return [...colors];
}

function compactCard(row) {
    const id = String(row.scryfall_id || "").trim();

    if (!id) {
        throw new Error(
            `Missing scryfall_id for row: ${JSON.stringify(row)}`
        );
    }

    const typeLine = String(row.type_line || "").trim();
    const isBasicLand = typeLine.startsWith("Basic Land");
    const isLand = typeLine.includes("Land");
    const isBoosterEligible = true;
    const isFoilEligible = true;

    return {
        id,
        set: String(row.set || setCode).toLowerCase(),
        name: String(row.name || "").trim(),
        number: String(row.collector_number || "").trim(),

        rarity: normalizeRarity(row.rarity),

        mana_cost:
            String(row.mana_cost || "").trim() || null,

        cmc:
            row.cmc === "" || row.cmc == null
                ? null
                : Number(row.cmc),

        colors: parseColorsFromManaCost(row.mana_cost),

        type_line: typeLine || null,

        is_basic_land: isBasicLand,
        is_land: isLand,
        is_booster_eligible: isBoosterEligible,
        is_foil_eligible: isFoilEligible,

        image_uri:
            String(row.image_uri || "").trim() || null,

        scryfall_uri:
            String(row.scryfall_uri || "").trim() || null
    };
}

async function readCsv(path) {
    if (!fs.existsSync(path)) {
        throw new Error(`CSV file not found: ${path}`);
    }

    const rows = [];

    await new Promise((resolve, reject) => {
        fs.createReadStream(path)
            .pipe(
                parse({
                    columns: true,
                    skip_empty_lines: true,
                    trim: true
                })
            )
            .on("data", row => rows.push(row))
            .on("error", reject)
            .on("end", resolve);
    });

    return rows;
}

function queueIndex(indexes, key, id) {
    if (!indexes[key]) {
        indexes[key] = new Set();
    }

    indexes[key].add(id);
}

console.log(`Reading CSV: ${csvPath}`);

const rows = await readCsv(csvPath);

console.log(`Read ${rows.length} rows`);

const cards = rows.map(compactCard);

console.log(`Normalized ${cards.length} cards`);

const indexes = {};
const cardIds = [];

for (const card of cards) {
    cardIds.push(card.id);

    queueIndex(
        indexes,
        `index:${setCode}:rarity:${card.rarity}`,
        card.id
    );

    if (card.is_basic_land) {
        queueIndex(
            indexes,
            `index:${setCode}:basic_land`,
            card.id
        );
    }

    for (const color of card.colors.length
        ? card.colors
        : ["C"]) {
        queueIndex(
            indexes,
            `index:${setCode}:color:${color}`,
            card.id
        );
    }

    if (card.rarity === "common" && !card.is_basic_land) {
        queueIndex(indexes, `index:${setCode}:pool:common_nonland`, card.id);
    }

    if (card.rarity === "uncommon" && !card.is_basic_land) {
        queueIndex(indexes, `index:${setCode}:pool:uncommon_nonland`, card.id);
    }

    if (card.rarity === "rare" && !card.is_basic_land) {
        queueIndex(indexes, `index:${setCode}:pool:rare_nonland`, card.id);
        queueIndex(indexes, `index:${setCode}:pool:rare_mythic_nonland`, card.id);
    }

    if (card.rarity === "mythic" && !card.is_basic_land) {
        queueIndex(indexes, `index:${setCode}:pool:mythic_nonland`, card.id);
        queueIndex(indexes, `index:${setCode}:pool:rare_mythic_nonland`, card.id);
    }

    if (card.is_basic_land) {
        queueIndex(indexes, `index:${setCode}:pool:basic_land`, card.id);
    }

    if (card.is_booster_eligible && !card.is_basic_land) {
        queueIndex(indexes, `index:${setCode}:pool:booster_eligible`, card.id);
    }

    if (card.is_foil_eligible && !card.is_basic_land) {
        queueIndex(indexes, `index:${setCode}:pool:foil_eligible`, card.id);
    }
}

console.log("Writing cards to Redis...");

const BATCH_SIZE = 50;

for (
    let i = 0;
    i < cards.length;
    i += BATCH_SIZE
) {
    const batch = cards.slice(i, i + BATCH_SIZE);

    const pipeline = redis.pipeline();

    for (const card of batch) {
        pipeline.set(
            `card:${setCode}:${card.id}`,
            card
        );

        pipeline.set(
            `index:${setCode}:name:${slugify(card.name)}`,
            card.id
        );

        pipeline.set(
            `index:${setCode}:number:${card.number}`,
            card.id
        );
    }

    await pipeline.exec();

    console.log(
        `Wrote cards ${i + 1}-${Math.min(
            i + BATCH_SIZE,
            cards.length
        )} of ${cards.length}`
    );
}

console.log("Writing set indexes...");

const indexPipeline = redis.pipeline();

indexPipeline.set(
    `set:${setCode}:cards`,
    cardIds
);

indexPipeline.set(
    `set:${setCode}:meta`,
    {
        set: setCode,
        cardCount: cards.length,
        importedAt: new Date().toISOString(),
        source: csvPath
    }
);

for (const [key, ids] of Object.entries(indexes)) {
    indexPipeline.set(key, [...ids]);
}

await indexPipeline.exec();

console.log(
    `Imported ${cards.length} cards into set:${setCode}`
);

process.exit(0);