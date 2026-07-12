export const MANA_BOX_FIELD_ALIASES = {
  name: ["Name", "Card Name", "name", "card_name"],
  quantity: ["Quantity", "Count", "quantity", "count"],
  scryfallId: ["Scryfall ID", "Scryfall Id", "ScryfallID", "scryfall_id", "id"],
  setCode: ["Set code", "Set Code", "Set", "set_code", "set"],
  collectorNumber: ["Collector Number", "Collector number", "collector_number", "number"],
  language: ["Language", "language"],
  condition: ["Condition", "condition"],
  foil: ["Foil", "Finish", "foil", "finish"],
  location: ["Binder Name", "Binder", "List Name", "List", "location", "binder_name", "list_name"]
};

/**
 * Searches case-insensitively for mapped keys in the row.
 * @param {object} row Raw parsed row
 * @param {string[]} aliases List of column name aliases
 * @returns {any} Column value or null
 */
export function getRowValue(row, aliases) {
  // Direct match first
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null) {
      return row[alias];
    }
  }

  // Case-insensitive match second
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const lowerAlias = alias.toLowerCase();
    const foundKey = keys.find(k => k.toLowerCase() === lowerAlias);
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      return row[foundKey];
    }
  }

  return null;
}

/**
 * Maps a raw row object to canonical JS keys.
 * @param {object} row Raw parsed row
 * @returns {object} Canonical object with mapped field names and `__rowNumber`
 */
export function mapRowHeaders(row) {
  const mapped = {};
  
  for (const [canonicalField, aliases] of Object.entries(MANA_BOX_FIELD_ALIASES)) {
    mapped[canonicalField] = getRowValue(row, aliases);
  }

  mapped.__rowNumber = row.__rowNumber;
  return mapped;
}
