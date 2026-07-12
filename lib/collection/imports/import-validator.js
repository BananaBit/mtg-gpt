/**
 * Validates a list of normalized rows.
 * @param {Array<object>} normalizedRows 
 * @returns {object} { success: boolean, errors: Array<{row, field, code, message}>, warnings: Array<{row, code, message}> }
 */
export function validateNormalizedRows(normalizedRows) {
  const errors = [];
  const warnings = [];

  if (!normalizedRows || normalizedRows.length === 0) {
    errors.push({
      row: 0,
      field: "rows",
      code: "NO_VALID_DATA_ROWS",
      message: "No valid data rows found in the import."
    });
    return { success: false, errors, warnings };
  }

  for (const row of normalizedRows) {
    const rowNum = row.row_number;

    // 1. Validate Card Name
    if (!row.name) {
      errors.push({
        row: rowNum,
        field: "name",
        code: "MISSING_CARD_NAME",
        message: "Missing card name in row."
      });
    }

    // 2. Validate Quantity
    if (row.quantity === null || row.quantity === undefined || Number.isNaN(row.quantity)) {
      errors.push({
        row: rowNum,
        field: "quantity",
        code: "INVALID_QUANTITY",
        message: "Quantity must be a positive integer."
      });
    } else if (row.quantity <= 0) {
      errors.push({
        row: rowNum,
        field: "quantity",
        code: "INVALID_QUANTITY",
        message: "Quantity must be greater than zero."
      });
    }

    // 3. Collect Warnings
    if (!row.scryfall_id) {
      if (row.set_code && row.collector_number) {
        warnings.push({
          row: rowNum,
          code: "MISSING_SCRYFALL_ID",
          message: `The card was imported using set (${row.set_code.toUpperCase()}) and collector number (${row.collector_number}).`
        });
      } else {
        warnings.push({
          row: rowNum,
          code: "INCOMPLETE_PRINTING_METADATA",
          message: "Card has no Scryfall ID, set code, or collector number."
        });
      }
    }

    if (!row.condition) {
      warnings.push({
        row: rowNum,
        code: "UNKNOWN_CONDITION",
        message: "Unknown or unmapped condition value."
      });
    }

    if (row.location === "Unassigned") {
      warnings.push({
        row: rowNum,
        code: "MISSING_BINDER_LOCATION",
        message: "Missing binder location, defaulting to 'Unassigned'."
      });
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings
  };
}
