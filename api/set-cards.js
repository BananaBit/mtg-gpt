```js
const SCRYFALL_HEADERS = {
  "User-Agent": "mtg-beginner-rules-coach/1.0",
  "Accept": "application/json;q=0.9,*/*;q=0.8",
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 75;
const MAX_PAGE_SIZE = 100;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

const ALLOWED_VIEWS = new Set(["names", "limited"]);

const ALLOWED_RARITIES = new Set([
  "common",
  "uncommon",
  "rare",
  "mythic",
  "special",
  "bonus",
]);

const COLORS = new Set(["W", "U", "B", "R", "G"]);
const COLORS_WITH_COLORLESS = new Set(["W", "U", "B", "R", "G", "C"]);

const COLOR_ALIASES = {
  white: ["W"],
  blue: ["U"],
  black: ["B"],
  red: ["R"],
  green: ["G"],
  colorless: ["C"],

  azorius: ["W", "U"],
  dimir: ["U", "B"],
  rakdos: ["B", "R"],
  gruul: ["R", "G"],
  selesnya: ["G", "W"],
  orzhov: ["W", "B"],
  izzet: ["U", "R"],
  golgari: ["B", "G"],
  boros: ["R", "W"],
  simic: ["G", "U"],
};

const memoryCache = globalThis.__MTG_SET_CARDS_CACHE__ || new Map();
globalThis.__MTG_SET_CARDS_CACHE__ = memoryCache;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSetCode(value) {
  return String(firstQueryValue(value) || "").trim().toLowerCase();
}

function parseBoolean(value, defaultValue = false) {
  const normalized = String(firstQueryValue(value) ?? "").trim().toLowerCase();

  if (!normalized) return defaultValue;
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;

  return defaultValue;
}

function parsePositiveInteger(value, defaultValue, { min = 1, max = 100 } = {}) {
  const parsed = Number.parseInt(firstQueryValue(value), 10);

  if (Number.isNaN(parsed)) return defaultValue;

  return Math.min(Math.max(parsed, min), max);
}

function parseView(value) {
  const view = String(firstQueryValue(value) || "limited").trim().toLowerCase();

  if (!ALLOWED_VIEWS.has(view)) {
    const error = new Error(
      `Invalid view "${view}". Supported views: ${[...ALLOWED_VIEWS].join(", ")}`
    );
    error.status = 400;
    throw error;
  }

  return view;
}

function parseCsv(value) {
  if (!value) return [];

  return String(firstQueryValue(value))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRarities(value) {
  const rarities = parseCsv(value).map((rarity) => rarity.toLowerCase());

  for (const rarity of rarities) {
    if (!ALLOWED_RARITIES.has(rarity)) {
      const error = new Error(
        `Invalid rarity "${rarity}". Supported rarities: ${[
          ...ALLOWED_RARITIES,
        ].join(", ")}`
      );
      error.status = 400;
      throw error;
    }
  }

  return rarities;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseColorInput(
  value,
  { allowColorless = false, requirePair = false } = {}
) {
  if (!value) return [];

  const raw = String(firstQueryValue(value)).trim();

  if (!raw) return [];

  const aliasKey = raw.toLowerCase().replace(/[\s_\-/]/g, "");

  if (COLOR_ALIASES[aliasKey]) {
    const aliasColors = COLOR_ALIASES[aliasKey];

    if (requirePair && aliasColors.length !== 2) {
      const error = new Error(
        `Invalid colorPair "${raw}". Use exactly two colors, such as WU.`
      );
      error.status = 400;
      throw error;
    }

    return aliasColors;
  }

  const normalized = raw.toUpperCase().replace(/[\s,_\-/]/g, "");
  const parsedColors = unique(normalized.split(""));
  const allowed = allowColorless ? COLORS_WITH_COLORLESS : COLORS;

  for (const color of parsedColors) {
    if (!allowed.has(color)) {
      const error = new Error(
        `Invalid color "${color}". Supported colors: ${
          allowColorless ? "W, U, B, R, G, C" : "W, U, B, R, G"
        }`
      );
      error.status = 400;
      throw error;
    }
  }

  if (requirePair && parsedColors.length !== 2) {
    const error = new Error(
      `Invalid colorPair "${raw}". Use exactly two colors, such as WU.`
    );
    error.status = 400;
    throw error;
  }

  return parsedColors;
}

function normalizeText(value) {
  if (!value) return null;

  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getColors(card) {
  if (card.colors?.length) return card.colors;

  if (card.card_faces?.length) {
    return unique(card.card_faces.flatMap((face) => face.colors || []));
  }

  return [];
}

function getColorIdentity(card) {
  if (card.color_identity?.length) return card.color_identity;

  if (card.card_faces?.length) {
    return unique(
      card.card_faces.flatMap(
        (face) => face.color_indicator || face.colors || []
      )
    );
  }

  return [];
}

function getOracleText(card) {
  if (card.oracle_text) return normalizeText(card.oracle_text);

  if (!card.card_faces?.length) return null;

  return normalizeText(
    card.card_faces
      .map((face) => {
        const faceParts = [
          face.name,
          face.mana_cost,
          face.type_line,
          face.oracle_text,
          face.power || face.toughness
            ? [face.power, face.toughness].filter(Boolean).join("/")
            : null,
          face.loyalty ? `Loyalty ${face.loyalty}` : null,
          face.defense ? `Defense ${face.defense}` : null,
        ].filter(Boolean);

        return faceParts.join(" — ");
      })
      .join(" // ")
  );
}

function getPowerToughness(card) {
  if (card.power || card.toughness) {
    return [card.power, card.toughness].filter(Boolean).join("/");
  }

  return null;
}

function getPrimaryType(typeLine) {
  if (!typeLine) return null;

  return typeLine.split("—")[0].trim();
}

function omitEmptyFields(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([_, value]) => {
      if (value === null || value === undefined) return false;
      if (value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    })
  );
}

function shouldIncludeColorIdentity(colors, colorIdentity) {
  if (!colorIdentity?.length) return false;

  return colorIdentity.join("") !== colors.join("");
}

function cardToNamesView(card) {
  const colors = getColors(card);
  const colorIdentity = getColorIdentity(card);

  return omitEmptyFields({
    name: card.name,
    rarity: card.rarity,
    colors,
    color_identity: shouldIncludeColorIdentity(colors, colorIdentity)
      ? colorIdentity
      : undefined,
    mv: card.cmc,
    type: getPrimaryType(card.type_line),
    number: card.collector_number,
  });
}

function cardToLimitedView(card) {
  const colors = getColors(card);
  const colorIdentity = getColorIdentity(card);

  return omitEmptyFields({
    name: card.name,
    cost: card.mana_cost || null,
    mv: card.cmc,
    colors,
    color_identity: shouldIncludeColorIdentity(colors, colorIdentity)
      ? colorIdentity
      : undefined,
    rarity: card.rarity,
    type: card.type_line,
    text: getOracleText(card),
    pt: getPowerToughness(card),
    loyalty: card.loyalty || null,
    defense: card.defense || null,
    keywords: card.keywords || [],
    number: card.collector_number,
  });
}

function transformCard(card, view) {
  if (view === "names") return cardToNamesView(card);

  return cardToLimitedView(card);
}

function matchesRarity(card, rarities) {
  if (!rarities.length) return true;

  return rarities.includes(card.rarity);
}

function matchesColor(card, requestedColors) {
  if (!requestedColors.length) return true;

  const colors = getColors(card);
  const colorIdentity = getColorIdentity(card);
  const comparisonColors = colorIdentity.length ? colorIdentity : colors;

  if (requestedColors.includes("C")) {
    return comparisonColors.length === 0;
  }

  return requestedColors.some((color) => comparisonColors.includes(color));
}

function matchesColorPair(card, colorPair) {
  if (!colorPair.length) return true;

  const allowedColors = new Set(colorPair);
  const colors = getColors(card);
  const colorIdentity = getColorIdentity(card);
  const comparisonColors = colorIdentity.length ? colorIdentity : colors;

  // Colorless cards are playable in any color pair.
  if (comparisonColors.length === 0) return true;

  return comparisonColors.every((color) => allowedColors.has(color));
}

function applyFilters(cards, { rarities, colors, colorPair }) {
  return cards.filter((card) => {
    return (
      matchesRarity(card, rarities) &&
      matchesColor(card, colors) &&
      matchesColorPair(card, colorPair)
    );
  });
}

function paginate(cards, { page, pageSize }) {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return cards.slice(startIndex, endIndex);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: SCRYFALL_HEADERS,
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    const error = new Error("Scryfall returned a non-JSON response");
    error.status = response.status || 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      data.details || data.error || "Scryfall request failed"
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

async function fetchAllCardsForSet(setCode, options) {
  const { includeExtras = false, includeVariations = false } = options;

  const cacheKey = JSON.stringify({
    setCode,
    includeExtras,
    includeVariations,
  });

  const cached = memoryCache.get(cacheKey);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const setInfo = await fetchJson(
    `https://api.scryfall.com/sets/${encodeURIComponent(setCode)}`
  );

  const searchUrl = new URL("https://api.scryfall.com/cards/search");
  searchUrl.searchParams.set("q", `e:${setInfo.code}`);
  searchUrl.searchParams.set("unique", "prints");
  searchUrl.searchParams.set("order", "set");
  searchUrl.searchParams.set("include_extras", String(includeExtras));
  searchUrl.searchParams.set("include_variations", String(includeVariations));

  const cards = [];
  let nextUrl = searchUrl.toString();

  while (nextUrl) {
    const page = await fetchJson(nextUrl);

    cards.push(...(page.data || []));
    nextUrl = page.has_more ? page.next_page : null;

    // Be polite with Scryfall pagination.
    if (nextUrl) {
      await sleep(150);
    }
  }

  const value = { setInfo, cards };

  memoryCache.set(cacheKey, {
    createdAt: Date.now(),
    value,
  });

  return value;
}

function buildResponse({
  setInfo,
  allCards,
  filteredCards,
  transformedCards,
  query,
}) {
  const totalPages =
    query.full || filteredCards.length === 0
      ? query.full && filteredCards.length > 0
        ? 1
        : 0
      : Math.ceil(filteredCards.length / query.pageSize);

  const hasMore = query.full ? false : query.page < totalPages;

  return {
    set: setInfo.code,
    name: setInfo.name,
    scryfall: setInfo.scryfall_uri,
    view: query.view,
    full: query.full,
    includeExtras: query.includeExtras,
    includeVariations: query.includeVariations,
    filters: omitEmptyFields({
      rarity: query.rarities,
      color: query.colors,
      colorPair: query.colorPair,
    }),
    totalCardsInSet: allCards.length,
    count: filteredCards.length,
    returned: transformedCards.length,
    page: query.full ? null : query.page,
    pageSize: query.full ? "all" : query.pageSize,
    totalPages,
    hasMore,
    nextPage: hasMore ? query.page + 1 : null,
    cards: transformedCards,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const setCode = normalizeSetCode(req.query.set || req.query.code);

    if (!setCode) {
      return res.status(400).json({
        error: "Missing set code. Example: /api/set-cards?set=msh",
      });
    }

    if (!/^[a-z0-9]{2,12}$/.test(setCode)) {
      return res.status(400).json({
        error: "Invalid set code format",
      });
    }

    const query = {
      setCode,
      view: parseView(req.query.view),
      full: parseBoolean(req.query.full, false),
      page: parsePositiveInteger(req.query.page, DEFAULT_PAGE, {
        min: 1,
        max: 10000,
      }),
      pageSize: parsePositiveInteger(req.query.pageSize, DEFAULT_PAGE_SIZE, {
        min: 1,
        max: MAX_PAGE_SIZE,
      }),
      includeExtras: parseBoolean(req.query.includeExtras, false),
      includeVariations: parseBoolean(req.query.includeVariations, false),
      rarities: parseRarities(req.query.rarity),
      colors: parseColorInput(req.query.color, {
        allowColorless: true,
      }),
      colorPair: parseColorInput(req.query.colorPair, {
        allowColorless: false,
        requirePair: true,
      }),
    };

    const { setInfo, cards } = await fetchAllCardsForSet(setCode, {
      includeExtras: query.includeExtras,
      includeVariations: query.includeVariations,
    });

    const filteredCards = applyFilters(cards, query);
    const pagedCards = query.full ? filteredCards : paginate(filteredCards, query);
    const transformedCards = pagedCards.map((card) =>
      transformCard(card, query.view)
    );

    res.setHeader(
      "Cache-Control",
      "s-maxage=3600, stale-while-revalidate=86400"
    );

    return res.status(200).json(
      buildResponse({
        setInfo,
        allCards: cards,
        filteredCards,
        transformedCards,
        query,
      })
    );
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message || "Internal proxy error",
    });
  }
}
```
