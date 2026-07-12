import { slugify } from "../cards.js";

/**
 * Calculates a unique, deterministic ownership key for physical card characteristics.
 * 
 * @param {object} row Normalized card row
 * @returns {string} Unique ownership identity string
 */
export function calculateOwnershipKey(row) {
  const scryfallId = row.scryfall_id ? String(row.scryfall_id).trim().toLowerCase() : "";
  const language = row.language ? String(row.language).trim().toLowerCase() : "en";
  const finish = row.finish ? String(row.finish).trim().toLowerCase() : "nonfoil";
  const condition = row.condition ? String(row.condition).trim().toLowerCase() : "unknown";
  const location = row.location ? String(row.location).trim() : "Unassigned";

  if (scryfallId) {
    return `${scryfallId}:${language}:${finish}:${condition}:${location}`;
  }

  // Fallback key: normalized name + set + collector number + language + finish + condition + location
  const normName = row.name ? slugify(row.name) : "";
  const setCode = row.set_code ? String(row.set_code).trim().toLowerCase() : "";
  const collNum = row.collector_number ? String(row.collector_number).trim().toLowerCase() : "";

  return `fallback:${normName}:${setCode}:${collNum}:${language}:${finish}:${condition}:${location}`;
}
