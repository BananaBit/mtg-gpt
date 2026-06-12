import fs from "fs";
import csv from "csv-parser";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const cards = [];

fs.createReadStream("./scryfall-msh.csv")
    .pipe(csv())
    .on("data", (row) => {
        cards.push({
            id: row.scryfall_id,
            name: row.name,
            number: Number(row.collector_number),
            rarity: row.rarity,
            mana_cost: row.mana_cost,
            cmc: Number(row.cmc),
            type_line: row.type_line,
            image_uri: row.image_uri,
            scryfall_uri: row.scryfall_uri
        });
    })
    .on("end", async () => {
        for (const card of cards) {
            await redis.set(
                `card:msh:${card.id}`,
                card
            );

            await redis.set(
                `index:msh:name:${slug(card.name)}`,
                card.id
            );
        }

        await redis.set("set:msh:cards", cards.map(c => c.id));

        await redis.set("set:msh:meta", {
            set: "msh",
            cardCount: cards.length,
            importedAt: new Date().toISOString()
        });
    });