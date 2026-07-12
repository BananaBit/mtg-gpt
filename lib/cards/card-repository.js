import { redis } from "../redis.js";
import { slugify, normalizeSetCode } from "../cards.js";
import { fetchCardById, fetchCardByExactName, fetchCardByPrinting, searchScryfall } from "./scryfall-client.js";

/**
 * Searches cards by set code, name, or collector number.
 * @param {object} filters 
 * @returns {Promise<any>}
 */
export async function searchCards({ set, name, number, id, color, type }) {
  const setCode = normalizeSetCode(set);
  
  if (id) {
    // If ID is provided, try Scryfall directly
    try {
      const card = await fetchCardById(id);
      return { items: [card] };
    } catch (err) {
      console.error("Scryfall lookup error in searchCards:", err);
      return { items: [] };
    }
  }

  if (!setCode) {
    // Fallback to Scryfall search if no set is provided
    if (name || color || type) {
      try {
        const query = [name, color && `color:${color}`, type && `type:${type}`].filter(Boolean).join(" ");
        const scryfallResult = await searchScryfall(query);
        return { items: scryfallResult.data || [] };
      } catch (err) {
        console.error("Scryfall search error in searchCards:", err);
        return { items: [] };
      }
    }
    return { items: [] };
  }

  let cardId = null;

  if (name) {
    cardId = await redis.get(`index:${setCode}:name:${slugify(name)}`);
  }

  if (!cardId && number) {
    cardId = await redis.get(`index:${setCode}:number:${number}`);
  }

  if (!cardId) {
    return { items: [] };
  }

  const card = await redis.get(`card:${setCode}:${cardId}`);
  if (!card) {
    return { items: [] };
  }

  // Parse card string if stored as JSON string in Redis
  const parsedCard = typeof card === "string" ? JSON.parse(card) : card;

  return { items: [parsedCard] };
}

/**
 * Resolves full card details from Redis or Scryfall client.
 * @param {object} identifier { id, name, set, number }
 * @returns {Promise<any|null>} Full card details
 */
export async function getCardDetails(identifier) {
  const { id, name, set, number } = identifier;

  if (id) {
    return await fetchCardById(id);
  }

  if (set && number) return fetchCardByPrinting(normalizeSetCode(set), number);
  if (name && !set) return fetchCardByExactName(name);

  const setCode = normalizeSetCode(set);
  if (!setCode || (!name && !number)) {
    return null;
  }

  let cardId = null;
  if (name) {
    cardId = await redis.get(`index:${setCode}:name:${slugify(name)}`);
  }
  if (!cardId && number) {
    cardId = await redis.get(`index:${setCode}:number:${number}`);
  }

  if (!cardId) {
    // If not found in Redis, try searching on Scryfall
    if (name) {
      try {
        const query = `!"${name}" set:${setCode}`;
        const scryfallResult = await searchScryfall(query);
        if (scryfallResult.data && scryfallResult.data.length > 0) {
          return scryfallResult.data[0];
        }
      } catch (err) {
        console.error("Scryfall query in getCardDetails fallback failed:", err);
      }
    }
    return null;
  }

  // Fetch full details from Scryfall using Scryfall ID
  return await fetchCardById(cardId);
}

/**
 * Resolves Scryfall card records for a list of entries.
 * @param {Array<object>} entries 
 * @returns {Promise<Array<object>>} Resolved entries with scryfall_id, oracle_id, etc.
 */
export async function resolveCards(entries) {
  const resolved = [];
  
  for (const entry of entries) {
    let scryfallId = entry.scryfallId || entry.scryfall_id;
    let name = entry.name;
    let setCode = normalizeSetCode(entry.setCode || entry.set_code);
    let number = entry.collectorNumber || entry.collector_number;

    let oracleId = null;
    let canonical = {};
    let resolvedName = name;
    let resolvedSet = setCode;
    let resolvedNumber = number;

    // Check Redis for scryfallId if missing but set/name is present
    if (!scryfallId && setCode) {
      if (name) {
        scryfallId = await redis.get(`index:${setCode}:name:${slugify(name)}`);
      }
      if (!scryfallId && number) {
        scryfallId = await redis.get(`index:${setCode}:number:${number}`);
      }
    }

    // If we resolved a Scryfall ID from Redis, or if one was provided:
    if (scryfallId) {
      // Let's fetch details to resolve the oracle ID
      try {
        const details = await fetchCardById(scryfallId);
        canonical = details;
        oracleId = details.oracle_id;
        resolvedName = details.name;
        resolvedSet = details.set;
        resolvedNumber = details.collector_number;
      } catch (err) {
        console.error(`Failed to resolve Scryfall ID ${scryfallId} during card resolution:`, err);
      }
    }

    resolved.push({
      ...canonical,
      ...entry,
      scryfall_id: scryfallId || null,
      oracle_id: oracleId || null,
      name: resolvedName,
      set_code: resolvedSet || null,
      collector_number: resolvedNumber || null,
    });
  }

  return resolved;
}
