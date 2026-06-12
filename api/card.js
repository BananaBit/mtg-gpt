import { redis } from "../lib/redis.js";
import { normalizeSetCode, slugify, firstQueryValue } from "../lib/cards.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const setCode = normalizeSetCode(req.query.set || req.query.code);

    if (!setCode) {
      return res.status(400).json({ error: "Missing set code" });
    }

    const id = String(firstQueryValue(req.query.id) || "").trim();
    const name = String(firstQueryValue(req.query.name) || "").trim();
    const number = String(firstQueryValue(req.query.number) || "").trim();

    let cardId = id;

    if (!cardId && name) {
      cardId = await redis.get(`index:${setCode}:name:${slugify(name)}`);
    }

    if (!cardId && number) {
      cardId = await redis.get(`index:${setCode}:number:${number}`);
    }

    if (!cardId) {
      return res.status(400).json({
        error: "Provide id, name, or number"
      });
    }

    const card = await redis.get(`card:${setCode}:${cardId}`);

    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    return res.status(200).json({ set: setCode, card });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
}