import { redis } from "../redis.js";
import { slugify, normalizeSetCode } from "../cards.js";
import {
  fetchCardById,
  fetchCardByExactName,
  fetchCardByPrinting,
  fetchCardCollection,
  searchScryfall
} from "./scryfall-client.js";

const SCRYFALL_COLLECTION_LIMIT = 75;
const SCRYFALL_BATCH_CONCURRENCY = 2;
const REDIS_LOOKUP_CONCURRENCY = 8;

function normalizeCardName(value) {
  return String(value || "").trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function identifierKey(identifier) {
  if (identifier.id) return `id:${String(identifier.id).toLowerCase()}`;
  if (identifier.set && identifier.collector_number) {
    return `printing:${normalizeSetCode(identifier.set)}:${String(identifier.collector_number).trim().toLowerCase()}`;
  }
  if (identifier.name) return `name:${normalizeCardName(identifier.name)}`;
  return null;
}

function entryIdentifier(entry) {
  const id = String(entry.scryfallId || entry.scryfall_id || "").trim();
  const set = normalizeSetCode(entry.setCode || entry.set_code);
  const collectorNumber = String(entry.collectorNumber || entry.collector_number || "").trim();
  const name = String(entry.name || "").trim();

  if (id) return { id };
  if (set && collectorNumber) return { set, collector_number: collectorNumber };
  if (name) return { name };
  return null;
}

function cardMatchesIdentifier(card, identifier) {
  if (identifier.id) return String(card.id || "").toLowerCase() === String(identifier.id).toLowerCase();
  if (identifier.set && identifier.collector_number) {
    return normalizeSetCode(card.set) === normalizeSetCode(identifier.set)
      && String(card.collector_number || "").toLowerCase() === String(identifier.collector_number).toLowerCase();
  }
  if (identifier.name) {
    const requestedName = normalizeCardName(identifier.name);
    if (normalizeCardName(card.name) === requestedName) return true;
    return (card.card_faces || []).some((face) => normalizeCardName(face.name) === requestedName);
  }
  return false;
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await callback(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

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
export async function resolveCards(entries, { cache = new Map() } = {}) {
  const prepared = await mapWithConcurrency(entries, REDIS_LOOKUP_CONCURRENCY, async (entry) => {
    const originalIdentifier = entryIdentifier(entry);
    if (!originalIdentifier) return { entry, originalKey: null, identifier: null };

    const originalKey = identifierKey(originalIdentifier);
    if (cache.has(originalKey)) return { entry, originalKey, cached: cache.get(originalKey) };

    let identifier = originalIdentifier;
    const setCode = normalizeSetCode(entry.setCode || entry.set_code);
    const name = String(entry.name || "").trim();
    const number = String(entry.collectorNumber || entry.collector_number || "").trim();

    // Reuse imported set indexes when present, but fall back to Scryfall's
    // printing or exact-name identifier if Redis is unavailable or misses.
    if (!identifier.id && setCode) {
      try {
        let scryfallId = name
          ? await redis.get(`index:${setCode}:name:${slugify(name)}`)
          : null;
        if (!scryfallId && number) {
          scryfallId = await redis.get(`index:${setCode}:number:${number}`);
        }
        if (scryfallId) identifier = { id: String(scryfallId) };
      } catch (error) {
        console.error("Redis index lookup failed during card resolution; falling back to Scryfall:", error);
      }
    }

    return { entry, originalKey, identifier };
  });

  const uniqueIdentifiers = new Map();
  for (const item of prepared) {
    if (item.cached || !item.identifier) continue;
    const key = identifierKey(item.identifier);
    if (!uniqueIdentifiers.has(key)) uniqueIdentifiers.set(key, item.identifier);
  }

  const identifiers = [...uniqueIdentifiers.values()];
  const batches = [];
  for (let index = 0; index < identifiers.length; index += SCRYFALL_COLLECTION_LIMIT) {
    batches.push(identifiers.slice(index, index + SCRYFALL_COLLECTION_LIMIT));
  }

  const batchResults = await mapWithConcurrency(
    batches,
    SCRYFALL_BATCH_CONCURRENCY,
    async (batch) => {
      try {
        return { batch, response: await fetchCardCollection(batch), error: null };
      } catch (error) {
        console.error("Scryfall collection lookup failed during card resolution:", error);
        return { batch, response: null, error };
      }
    }
  );

  const resolutions = new Map();
  for (const { batch, response, error } of batchResults) {
    for (const identifier of batch) {
      const key = identifierKey(identifier);
      const card = response?.data?.find((candidate) => cardMatchesIdentifier(candidate, identifier)) || null;
      resolutions.set(key, card
        ? { card, resolution_status: "resolved" }
        : { card: null, resolution_status: error ? "provider_error" : "not_found" });
    }
  }

  return prepared.map(({ entry, originalKey, identifier, cached }) => {
    const resolution = cached || (identifier
      ? resolutions.get(identifierKey(identifier))
      : { card: null, resolution_status: "invalid_identifier" });
    if (originalKey && !cached) cache.set(originalKey, resolution);

    const canonical = resolution?.card || {};
    return {
      ...canonical,
      ...entry,
      scryfall_id: canonical.id || null,
      oracle_id: canonical.oracle_id || null,
      name: canonical.name || entry.name,
      set_code: canonical.set || normalizeSetCode(entry.setCode || entry.set_code) || null,
      collector_number: canonical.collector_number || entry.collectorNumber || entry.collector_number || null,
      resolution_status: resolution?.resolution_status || "not_found"
    };
  });
}
