import { parse } from "csv-parse/sync";

/**
 * Parses raw CSV text into row objects with row number tracking.
 * @param {string} csvText Raw CSV content string
 * @returns {Array<object>} Array of parsed rows with `__rowNumber` attributes
 */
export function parseManaBoxCsv(csvText) {
  if (!csvText || typeof csvText !== "string" || !csvText.trim()) {
    throw new Error("CSV content is empty or invalid.");
  }
  
  const rows = parse(csvText, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false
  }).map((row, index) => ({
    ...row,
    __rowNumber: index + 2 // header row is line 1, data starts at line 2
  }));

  const maxRows = Number(process.env.IMPORT_MAX_ROWS || 25000);
  if (rows.length > maxRows) {
    throw new Error(`CSV exceeds the maximum of ${maxRows} data rows.`);
  }
  return rows;
}
