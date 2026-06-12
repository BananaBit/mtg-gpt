import { redis } from "../lib/redis.js";
import { normalizeSetCode, slugify, firstQueryValue } from "../lib/cards.js";

const SCRYFALL_HEADERS = {
    "User-Agent": "mtg-gpt/1.0",
    Accept: "application/json;q=0.9,*/*;q=0.8"
};

async function fetchScryfallCard(id) {
    const response = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`, {
        headers: SCRYFALL_HEADERS
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.details || data.error || "Scryfall card lookup failed");
    }

    return data;
}

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const setCode = normalizeSetCode(req.query.set || req.query.code);
        const id = String(firstQueryValue(req.query.id) || "").trim();
        const name = String(firstQueryValue(req.query.name) || "").trim();

        let cardId = id;

        if (!cardId) {
            if (!setCode || !name) {
                return res.status(400).json({
                    error: "Provide either id, or set + name"
                });
            }

            cardId = await redis.get(`index:${setCode}:name:${slugify(name)}`);
        }

        if (!cardId) {
            return res.status(404).json({ error: "Card not found in local database" });
        }

        const card = await fetchScryfallCard(cardId);

        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");

        return res.status(200).json({ card });
    } catch (error) {
        return res.status(500).json({
            error: error.message || "Internal server error"
        });
    }
}