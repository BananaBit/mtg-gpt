import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import { parse } from "csv-parse";
import { redis } from "../lib/redis.js";
import { slugify } from "../lib/cards.js";

const [, , csvPath, rawSetCode] = process.argv;

if (!csvPath || !rawSetCode) {
    console.error("Usage: node scripts/import-set-csv.js ./scryfall-msh.csv msh");
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
        throw new Error(`Missing scryfall_id for row: ${JSON.stringify(row)}`);
    }

    return {
        id,
        set: String(row.set || setCode).toLowerCase(),
        name: String(row.name || "").trim(),
        number: String(row.collector_number || "").trim(),
        rarity: normalizeRarity(row.rarity),
        mana_cost: String(row.mana_cost || "").trim() || null,
        cmc: row.cmc === "" || row.cmc == null ? null : Number(row.cmc),
        colors: parseColorsFromManaCost(row.mana_cost),
        type_line: String(row.type_line || "").trim() || null,
        image_uri: String(row.image_uri || "").trim() || null,
        scryfall_uri: String(row.scryfall_uri || "").trim() || null
    };
}

async function readCsv(path) {
    if (!fs.existsSync(path)) {
        throw new Error(`CSV file not found: ${path}`);
    }

    const rows = [];

    await new Promise((resolve, reject) => {
        fs.createReadStream(path)
            .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
            .on("data", row => rows.push(row))
            .on("error", reject)
            .on("end", resolve);
    });

    return rows;
}

function addToArrayIndex(indexes, key, id) {
    if (!indexes[key]) indexes[key] = [];
    indexes[key].push(id);
}

const rows = await readCsv(csvPath);
const cards = rows.map(compactCard);

const indexes = {};
const cardIds = [];

for (const card of cards) {
    cardIds.push(card.id);

    addToArrayIndex(indexes, `index:${setCode}:rarity:${card.rarity}`, card.id);

    for (const color of card.colors.length ? card.colors : ["C"]) {
        addToArrayIndex(indexes, `index:${setCode}:color:${color}`, card.id);
    }

    await redis.set(`card:${setCode}:${card.id}`, card);
    await redis.set(`index:${setCode}:name:${slugify(card.name)}`, card.id);
    await redis.set(`index:${setCode}:number:${card.number}`, card.id);
}

await redis.set(`set:${setCode}:cards`, cardIds);

await redis.set(`set:${setCode}:meta`, {
    set: setCode,
    cardCount: cards.length,
    importedAt: new Date().toISOString(),
    source: csvPath
});

for (const [key, ids] of Object.entries(indexes)) {
    await redis.set(key, [...new Set(ids)]);
}

console.log(`Imported ${cards.length} cards into set:${setCode}`);