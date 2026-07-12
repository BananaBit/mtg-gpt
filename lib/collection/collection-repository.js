import { supabaseAdmin } from "../database/supabase-admin.js";

/**
 * Creates a new collection import audit record.
 * @param {object} metadata 
 * @returns {Promise<object>} Created import record
 */
export async function createImport({ source, filename, fileHash, status = "processing", initiatedBy = "gpt_action" }) {
  const { data, error } = await supabaseAdmin
    .from("collection_imports")
    .insert({
      source,
      filename,
      file_hash: fileHash,
      status,
      initiated_by: initiatedBy
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create import record: ${error.message}`);
  }
  return data;
}

export async function countRecentImports(since) {
  const { count, error } = await supabaseAdmin
    .from("collection_imports")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (error) throw new Error(`Failed to check import rate limit: ${error.message}`);
  return count || 0;
}

/**
 * Searches for a completed import with the matching file hash.
 * @param {string} fileHash SHA-256 hash of the file
 * @returns {Promise<object|null>} Completed import or null
 */
export async function findCompletedImportByHash(fileHash) {
  if (!fileHash) return null;
  
  const { data, error } = await supabaseAdmin
    .from("collection_imports")
    .select("*")
    .eq("file_hash", fileHash)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error looking up import by hash:", error);
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
}

/**
 * Executes snapshot synchronization atomically using Postgres RPC function.
 * @param {object} params { importId, entries }
 * @returns {Promise<object>} Sync summary results
 */
export async function syncCollectionSnapshot({ importId, entries }) {
  const { data, error } = await supabaseAdmin.rpc("sync_collection_snapshot", {
    p_import_id: importId,
    p_entries: entries
  });

  if (error) {
    throw new Error(`Database transaction sync failed: ${error.message}`);
  }
  return data;
}

/**
 * Marks an import session as failed.
 * @param {object} params { importId, error }
 */
export async function markImportFailed({ importId, error }) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  
  await supabaseAdmin
    .from("collection_imports")
    .update({
      status: "failed",
      error_message: errorMsg,
      completed_at: new Date().toISOString()
    })
    .eq("id", importId);
}

/**
 * Updates import record details (warnings, counts, status, etc.).
 * @param {string} importId 
 * @param {object} updates 
 */
export async function updateImportRecord(importId, updates) {
  const { error } = await supabaseAdmin
    .from("collection_imports")
    .update(updates)
    .eq("id", importId);

  if (error) {
    console.error(`Failed to update import record ${importId}:`, error);
  }
}

/**
 * Searches active owned cards with filter parameters.
 * @param {object} filters 
 * @returns {Promise<object>} Items and summary totals
 */
export async function searchCollection(filters = {}) {
  let query = supabaseAdmin
    .from("owned_cards")
    .select("name, quantity, set_code, collector_number, finish, condition, location, scryfall_id, language")
    .is("archived_at", null);

  if (filters.name) {
    query = query.ilike("name", `%${filters.name.trim()}%`);
  }
  if (filters.setCode) {
    query = query.eq("set_code", filters.setCode.trim().toLowerCase());
  }
  if (filters.collectorNumber) {
    query = query.eq("collector_number", filters.collectorNumber.trim());
  }
  if (filters.location) {
    query = query.eq("location", filters.location.trim());
  }
  if (filters.finish) {
    query = query.eq("finish", filters.finish.trim().toLowerCase());
  }
  if (filters.condition) {
    query = query.eq("condition", filters.condition.trim().toLowerCase());
  }
  if (filters.language) {
    query = query.eq("language", filters.language.trim().toLowerCase());
  }
  if (filters.scryfallId) {
    query = query.eq("scryfall_id", filters.scryfallId.trim().toLowerCase());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to query owned cards: ${error.message}`);
  }

  const totalEntries = data.length;
  const totalCopies = data.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return {
    query: filters,
    total_entries: totalEntries,
    total_copies: totalCopies,
    items: data || []
  };
}

/**
 * Gathers complete stats of the active collection.
 * @returns {Promise<object>} Active collections statistics
 */
export async function getCollectionStats() {
  const { data: allCards, error } = await supabaseAdmin
    .from("owned_cards")
    .select("name, quantity, condition, location, set_code, language, finish")
    .is("archived_at", null);

  if (error) {
    throw new Error(`Database query failed: ${error.message}`);
  }

  // Fetch last completed import info
  const { data: lastImportData } = await supabaseAdmin
    .from("collection_imports")
    .select("id, source, completed_at")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1);

  const lastImport = lastImportData && lastImportData.length > 0 ? lastImportData[0] : null;

  if (!allCards || allCards.length === 0) {
    return {
      distinct_entries: 0,
      unique_card_names: 0,
      total_copies: 0,
      foil_copies: 0,
      locations: 0,
      last_import: lastImport
    };
  }

  const uniqueNames = new Set();
  let totalPhysical = 0;
  let foilCopies = 0;
  const locations = new Set();
  
  const byLocation = {};
  const byFinish = {};
  const byCondition = {};
  const byLanguage = {};
  const bySet = {};

  for (const card of allCards) {
    const qty = Number(card.quantity) || 0;
    if (qty <= 0) continue;

    totalPhysical += qty;
    if (card.name) {
      uniqueNames.add(card.name.trim().toLowerCase());
    }

    if (card.location) {
      locations.add(card.location.trim());
      byLocation[card.location] = (byLocation[card.location] || 0) + qty;
    }

    const finish = card.finish || "nonfoil";
    byFinish[finish] = (byFinish[finish] || 0) + qty;
    if (finish === "foil") {
      foilCopies += qty;
    }

    if (card.condition) {
      byCondition[card.condition] = (byCondition[card.condition] || 0) + qty;
    }

    if (card.language) {
      byLanguage[card.language] = (byLanguage[card.language] || 0) + qty;
    }

    if (card.set_code) {
      const sCode = card.set_code.toUpperCase();
      bySet[sCode] = (bySet[sCode] || 0) + qty;
    }
  }

  return {
    distinct_entries: allCards.length,
    unique_card_names: uniqueNames.size,
    total_copies: totalPhysical,
    foil_copies: foilCopies,
    locations: locations.size,
    by_location: byLocation,
    by_finish: byFinish,
    by_condition: byCondition,
    by_language: byLanguage,
    by_set: bySet,
    last_import: lastImport
  };
}

/**
 * Retrieves matching owned cards by checking names.
 * @param {string[]} cardNames List of lowercase or mixed-case names
 * @returns {Promise<Array<object>>} Matching owned cards
 */
export async function checkCardOwnership(cardNames) {
  if (!cardNames || cardNames.length === 0) return [];

  const nameFilter = cardNames
    .map((name) => `name.ilike."${String(name).replace(/["\\]/g, "")}"`)
    .join(",");
  const { data, error } = await supabaseAdmin
    .from("owned_cards")
    .select("name, quantity, set_code, collector_number, finish, condition, location, scryfall_id")
    .is("archived_at", null)
    .or(nameFilter);

  if (error) {
    throw new Error(`Failed to query card ownership matching deck: ${error.message}`);
  }
  return data || [];
}
