import crypto from "node:crypto";
import { parseManaBoxCsv } from "../manabox/parse-csv.js";
import { detectManaBoxFormat } from "../manabox/detect-format.js";
import { mapRowHeaders } from "../manabox/map-headers.js";
import { normalizeRow } from "../manabox/normalize-row.js";
import { validateNormalizedRows } from "../imports/import-validator.js";
import { calculateOwnershipKey } from "../ownership-key.js";
import {
  createImport,
  findCompletedImportByHash,
  syncCollectionSnapshot,
  markImportFailed,
  updateImportRecord,
  countRecentImports,
} from "../collection-repository.js";

/**
 * Core import service that processes a ManaBox CSV string and synchronizes the collection.
 * @param {object} params { csvText: string, source?: string, filename?: string, confirmed: boolean }
 * @returns {Promise<object>} Result summary including import_id and statistics.
 */
export async function importCollection({ csvText, source = "manabox", filename = null, confirmed }) {
  // Ensure explicit confirmation
  if (confirmed !== true) {
    throw new Error("Import operation requires explicit confirmation (confirmed: true).");
  }

  if (source !== "manabox") throw new Error(`Unsupported import source: ${source}`);
  const maxBytes = Number(process.env.IMPORT_MAX_BYTES || 5 * 1024 * 1024);
  if (typeof csvText !== "string" || Buffer.byteLength(csvText, "utf8") > maxBytes) {
    throw new Error(`CSV content must be a string no larger than ${maxBytes} bytes.`);
  }
  const rateLimit = Number(process.env.IMPORT_RATE_LIMIT || 5);
  const recentImports = await countRecentImports(new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recentImports >= rateLimit) throw new Error("Import rate limit exceeded. Try again later.");

  // Compute file hash for duplicate detection (sha256)
  const hash = crypto.createHash("sha256").update(csvText, "utf8").digest("hex");

  // Check for previously completed import with same hash
  const previous = await findCompletedImportByHash(hash);
  if (previous) {
    return {
      success: true, status: "unchanged",
      message: "This exact ManaBox export has already been imported.",
      previous_import_id: previous.id
    };
  }

  // Create a new import record (status: processing)
  const importRecord = await createImport({
    source,
    filename,
    fileHash: hash,
    status: "processing",
    initiatedBy: "gpt_action",
  });

  const importId = importRecord.id;

  try {
    // 1. Parse CSV
    const rawRows = parseManaBoxCsv(csvText);

    // 2. Detect format support
    const formatInfo = detectManaBoxFormat(rawRows);
    if (!formatInfo.supported) {
      throw new Error(`Unsupported CSV format: ${formatInfo.reason}`);
    }

    // 3. Map and normalize rows
    const mappedRows = rawRows.map(mapRowHeaders);
    const normalizedRows = mappedRows.map(normalizeRow);

    // 4. Validate rows
    const validation = validateNormalizedRows(normalizedRows);
    if (!validation.success) {
      // Record validation errors in import record
      await updateImportRecord(importId, {
        status: "rejected",
        error_message: JSON.stringify({ errors: validation.errors, warnings: validation.warnings }),
        warnings: validation.warnings,
        completed_at: new Date().toISOString(),
      });
      return {
        success: false, status: "rejected", import_id: importId,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    // 5. Prepare entries for RPC sync
    const aggregated = new Map();
    for (const row of normalizedRows) {
      const ownership_key = calculateOwnershipKey(row);
      const existing = aggregated.get(ownership_key);
      if (existing) {
        existing.quantity += row.quantity;
        continue;
      }
      aggregated.set(ownership_key, {
        ownership_key,
        scryfall_id: row.scryfall_id,
        oracle_id: null, // will be filled via RPC if needed later
        name: row.name,
        set_code: row.set_code,
        collector_number: row.collector_number,
        quantity: row.quantity,
        finish: row.finish,
        language: row.language,
        condition: row.condition,
        location: row.location,
        first_seen_import_id: importId,
        last_seen_import_id: importId,
      });
    }
    const entries = [...aggregated.values()];
    if (entries.length > Number(process.env.IMPORT_MAX_ROWS || 25000)) {
      throw new Error("Import exceeds the maximum number of normalized entries.");
    }

    // 6. Run the transactional sync RPC
    const syncResult = await syncCollectionSnapshot({ importId, entries });

    // 7. Update import record with final statistics and warnings
    await updateImportRecord(importId, {
      status: "completed",
      source_rows: rawRows.length,
      normalized_entries: entries.length,
      total_copies: entries.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0),
      inserted_entries: syncResult.inserted_entries,
      updated_entries: syncResult.updated_entries,
      unchanged_entries: syncResult.unchanged_entries,
      archived_entries: syncResult.archived_entries,
      warnings: validation.warnings,
      completed_at: new Date().toISOString(),
    });

    return {
      success: true, status: "completed", import_id: importId, source, filename,
      source_rows: rawRows.length, normalized_entries: entries.length,
      total_copies: entries.reduce((sum, entry) => sum + entry.quantity, 0),
      inserted_entries: syncResult.inserted_entries,
      updated_entries: syncResult.updated_entries,
      unchanged_entries: syncResult.unchanged_entries,
      archived_entries: syncResult.archived_entries,
      warning_count: validation.warnings.length, warnings: validation.warnings
    };
  } catch (err) {
    // Mark import as failed and propagate error information
    await markImportFailed({ importId, error: err });
    await updateImportRecord(importId, {
      status: "failed",
      error_message: err.message || String(err),
      completed_at: new Date().toISOString(),
    });
    throw err;
  }
}
