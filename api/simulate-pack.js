import fs from "node:fs/promises";
import path from "node:path";
import { redis } from "../lib/redis.js";
import { normalizeSetCode, firstQueryValue } from "../lib/cards.js";

function sample(array, count, excludedIds = new Set()) {
    const pool = array.filter(card => !excludedIds.has(card.id));
    const selected = [];

    while (selected.length < count && pool.length) {
        const index = Math.floor(Math.random() * pool.length);
        const [card] = pool.splice(index, 1);
        selected.push(card);
        excludedIds.add(card.id);
    }

    return selected;
}

function weightedRarityChoice(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let roll = Math.random() * total;

    for (const [rarity, weight] of entries) {
        roll -= Number(weight);
        if (roll <= 0) return rarity;
    }

    return entries[0][0];
}

function weightedChoice(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);

    let roll = Math.random() * total;

    for (const [key, weight] of entries) {
        roll -= Number(weight);
        if (roll <= 0) return key;
    }

    return entries[0][0];
}

async function loadProductConfig(setCode, type) {
    const filePath = path.join(
        process.cwd(),
        "data",
        "products",
        setCode,
        `${type}.json`
    );

    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
}

async function getCardsByIds(setCode, ids) {
    if (!ids.length) return [];

    const pipeline = redis.pipeline();

    for (const id of ids) {
        pipeline.get(`card:${setCode}:${id}`);
    }

    return (await pipeline.exec()).filter(Boolean);
}

async function getCardsForRarity(setCode, rarity) {
    const ids = (await redis.get(`index:${setCode}:rarity:${rarity}`)) || [];
    return getCardsByIds(setCode, ids);
}

async function getCardsForPool(setCode, poolName) {
    const ids = (await redis.get(`index:${setCode}:pool:${poolName}`)) || [];
    return getCardsByIds(setCode, ids);
}

async function getPoolForSlot(setCode, slot) {
    let pool = [];

    if (slot.poolWeights) {
        const poolName = weightedChoice(slot.poolWeights);
        pool = await getCardsForPool(setCode, poolName);
    } else if (slot.pool) {
        pool = await getCardsForPool(setCode, slot.pool);
    } else if (slot.weights) {
        const rarity = weightedRarityChoice(slot.weights);
        pool = await getCardsForRarity(setCode, rarity);
    } else {
        const rarities = slot.rarity || [];
        const pools = await Promise.all(
            rarities.map(rarity => getCardsForRarity(setCode, rarity))
        );
        pool = pools.flat();
    }

    if (slot.excludeBasicLands) {
        pool = pool.filter(card => !card.is_basic_land);
    }

    return pool;
}

async function simulateProduct(setCode, config) {
    const cards = [];

    if (config.slots) {
        const usedIds = new Set();
        for (const slot of config.slots) {
            const pool = await getPoolForSlot(setCode, slot);
            const picked = sample(pool, slot.count, usedIds);

            for (const card of picked) {
                cards.push({
                    slot: slot.name,
                    foil: Boolean(slot.foil),
                    promo: Boolean(slot.promo),
                    ...card
                });
            }
        }
    } else if (config.contents) {
        for (const item of config.contents) {
            if (item.type) {
                const nestedConfig = await loadProductConfig(setCode, item.type);
                for (let i = 0; i < item.count; i++) {
                    const nestedCards = await simulateProduct(setCode, nestedConfig);
                    cards.push(...nestedCards);
                }
            } else if (item.name) {
                const usedIds = new Set();
                const pool = await getPoolForSlot(setCode, item);
                const picked = sample(pool, item.count, usedIds);
                for (const card of picked) {
                    cards.push({
                        slot: item.name,
                        foil: Boolean(item.foil),
                        promo: Boolean(item.promo),
                        ...card
                    });
                }
            }
        }
    }

    return cards;
}

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const setCode = normalizeSetCode(req.query.set || req.query.code);
        const type = String(firstQueryValue(req.query.type) || "play_booster")
            .trim()
            .toLowerCase();

        if (!setCode) {
            return res.status(400).json({
                error: "Missing set code. Example: /api/simulate-pack?set=msh&type=play_booster"
            });
        }

        const config = await loadProductConfig(setCode, type);
        const cards = await simulateProduct(setCode, config);

        return res.status(200).json({
            set: setCode,
            type,
            count: cards.length,
            cards
        });
    } catch (error) {
        return res.status(500).json({
            error: error.message || "Internal server error"
        });
    }
}