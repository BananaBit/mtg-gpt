/**
 * Normalizes condition text to the standard schema vocabulary.
 * @param {string} rawCondition 
 * @returns {string|null}
 */
export function normalizeCondition(rawCondition) {
  if (!rawCondition) return null;
  const cond = String(rawCondition).trim().toLowerCase();

  if (cond.includes("near mint") || cond === "nm") return "near_mint";
  if (cond.includes("lightly played") || cond.includes("slightly played") || cond === "lp" || cond === "sp") return "lightly_played";
  if (cond.includes("moderately played") || cond === "mp") return "moderately_played";
  if (cond.includes("heavily played") || cond === "hp") return "heavily_played";
  if (cond.includes("damaged") || cond === "dmg") return "damaged";
  if (cond.includes("mint")) return "mint";
  if (cond.includes("poor")) return "poor";

  // fallback to lowercase snakecase
  return cond.replace(/\s+/g, "_");
}

/**
 * Normalizes finish text/boolean to 'nonfoil', 'foil', or 'etched'.
 * @param {any} rawFoil 
 * @returns {"nonfoil"|"foil"|"etched"}
 */
export function normalizeFinish(rawFoil) {
  if (rawFoil === null || rawFoil === undefined) return "nonfoil";
  
  if (typeof rawFoil === "boolean") {
    return rawFoil ? "foil" : "nonfoil";
  }

  const fStr = String(rawFoil).trim().toLowerCase();
  if (fStr === "true" || fStr === "yes" || fStr === "foil" || fStr === "traditional foil") return "foil";
  if (fStr === "etched" || fStr === "etched foil") return "etched";
  if (fStr === "false" || fStr === "no" || fStr === "nonfoil" || fStr === "non-foil") return "nonfoil";
  
  return "nonfoil";
}

/**
 * Normalizes language codes.
 * @param {string} rawLang 
 * @returns {string}
 */
export function normalizeLanguage(rawLang) {
  if (!rawLang) return "en";
  const lang = String(rawLang).trim().toLowerCase();
  
  // Map common languages to short codes if needed
  if (lang === "english" || lang === "en") return "en";
  if (lang === "spanish" || lang === "es") return "es";
  if (lang === "french" || lang === "fr") return "fr";
  if (lang === "german" || lang === "de") return "de";
  if (lang === "italian" || lang === "it") return "it";
  if (lang === "portuguese" || lang === "pt") return "pt";
  if (lang === "japanese" || lang === "ja" || lang === "jp") return "ja";
  if (lang === "chinese simplified" || lang === "cs" || lang === "zh-hans") return "zh-hans";
  if (lang === "chinese traditional" || lang === "ct" || lang === "zh-hant") return "zh-hant";
  if (lang === "korean" || lang === "ko") return "ko";
  if (lang === "russian" || lang === "ru") return "ru";
  
  return lang;
}

/**
 * Normalizes a mapped row object.
 * @param {object} mappedRow Mapped canonical row object
 * @returns {object} Normalized row object
 */
export function normalizeRow(mappedRow) {
  // Set code normalization
  let setCode = mappedRow.setCode;
  if (setCode) {
    setCode = String(setCode).trim().toLowerCase();
  }

  // Quantity parsing
  let quantity = 1;
  if (mappedRow.quantity !== null && mappedRow.quantity !== undefined) {
    const parsedQty = Number(mappedRow.quantity);
    quantity = Number.isInteger(parsedQty) ? parsedQty : NaN;
  }

  // UUID cleanup
  let scryfallId = mappedRow.scryfallId;
  if (scryfallId) {
    scryfallId = String(scryfallId).trim().toLowerCase();
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    if (!uuidRegex.test(scryfallId)) {
      scryfallId = null; // invalid ID, clear it so it doesn't fail database constraints
    }
  }

  // location
  let location = "Unassigned";
  if (mappedRow.location) {
    const loc = String(mappedRow.location).trim();
    if (loc) {
      location = loc;
    }
  }

  return {
    row_number: mappedRow.__rowNumber,
    scryfall_id: scryfallId || null,
    name: mappedRow.name ? String(mappedRow.name).trim() : null,
    set_code: setCode || null,
    collector_number: mappedRow.collectorNumber ? String(mappedRow.collectorNumber).trim() : null,
    quantity: quantity,
    finish: normalizeFinish(mappedRow.foil),
    language: normalizeLanguage(mappedRow.language),
    condition: normalizeCondition(mappedRow.condition),
    location: location
  };
}
