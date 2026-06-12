import { redis } from "../lib/redis.js";
import {
  normalizeSetCode,
  parsePositiveInteger,
  paginate,
  firstQueryValue
} from "../lib/cards.js";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 75;
const MAX_PAGE_SIZE = 100;

async function getCardsByIds(setCode, ids) {
  if (!ids.length) return [];

  const pipeline = redis.pipeline();

  for (const id of ids) {
    pipeline.get(`card:${setCode}:${id}`);
  }

  return (await pipeline.exec()).filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const setCode = normalizeSetCode(req.query.set || req.query.code);

    if (!setCode) {
      return res.status(400).json({
        error: "Missing set code. Example: /api/set-cards?set=msh"
      });
    }

    const page = parsePositiveInteger(req.query.page, DEFAULT_PAGE, {
      min: 1,
      max: 10000
    });

    const pageSize = parsePositiveInteger(req.query.pageSize, DEFAULT_PAGE_SIZE, {
      min: 1,
      max: MAX_PAGE_SIZE
    });

    const rarity = String(firstQueryValue(req.query.rarity) || "")
      .trim()
      .toLowerCase();

    const color = String(firstQueryValue(req.query.color) || "")
      .trim()
      .toUpperCase();

    let ids;

    if (rarity) {
      ids = (await redis.get(`index:${setCode}:rarity:${rarity}`)) || [];
    } else if (color) {
      ids = (await redis.get(`index:${setCode}:color:${color}`)) || [];
    } else {
      ids = (await redis.get(`set:${setCode}:cards`)) || [];
    }

    const total = ids.length;
    const pagedIds = paginate(ids, page, pageSize);
    const cards = await getCardsByIds(setCode, pagedIds);
    const meta = (await redis.get(`set:${setCode}:meta`)) || null;

    return res.status(200).json({
      set: setCode,
      meta,
      filters: { rarity: rarity || null, color: color || null },
      count: total,
      returned: cards.length,
      page,
      pageSize,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
      hasMore: page * pageSize < total,
      cards
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Internal server error"
    });
  }
}