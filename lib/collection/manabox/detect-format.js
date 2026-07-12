import { MANA_BOX_FIELD_ALIASES, getRowValue } from "./map-headers.js";

/**
 * Checks whether the CSV header set looks like a supported ManaBox format.
 * @param {object[]} parsedRows Row objects parsed from CSV
 * @returns {object} { supported: boolean, source: string, confidence: "high"|"low", reason: string|null }
 */
export function detectManaBoxFormat(parsedRows) {
  if (!parsedRows || parsedRows.length === 0) {
    return {
      supported: false,
      source: "unknown",
      confidence: "low",
      reason: "No rows found in the parsed CSV file."
    };
  }

  const sampleRow = parsedRows[0];
  const keys = Object.keys(sampleRow);

  // Check name field
  const nameVal = getRowValue(sampleRow, MANA_BOX_FIELD_ALIASES.name);
  // Check quantity field
  const qtyVal = getRowValue(sampleRow, MANA_BOX_FIELD_ALIASES.quantity);

  if (nameVal === null) {
    return {
      supported: false,
      source: "unknown",
      confidence: "low",
      reason: "Missing card Name or Card Name column in CSV headers."
    };
  }

  if (qtyVal === null) {
    return {
      supported: false,
      source: "unknown",
      confidence: "low",
      reason: "Missing Quantity or Count column in CSV headers."
    };
  }

  // Check at least one printing identifier: Scryfall ID, Set Code, or Collector Number
  const scryfallIdVal = getRowValue(sampleRow, MANA_BOX_FIELD_ALIASES.scryfallId);
  const setCodeVal = getRowValue(sampleRow, MANA_BOX_FIELD_ALIASES.setCode);
  const collectorNumVal = getRowValue(sampleRow, MANA_BOX_FIELD_ALIASES.collectorNumber);

  if (scryfallIdVal === null && setCodeVal === null && collectorNumVal === null) {
    return {
      supported: false,
      source: "unknown",
      confidence: "low",
      reason: "CSV must contain at least one card printing identifier (Scryfall ID, Set, or Collector Number)."
    };
  }

  return {
    supported: true,
    source: "manabox",
    confidence: "high",
    reason: null
  };
}
