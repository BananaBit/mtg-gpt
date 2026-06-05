const SCRYFALL_HEADERS = {
  "User-Agent": "mtg-beginner-rules-coach/1.0",
  "Accept": "application/json;q=0.9,*/*;q=0.8",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeSetCode(value) {
  return String(value || "").trim().toLowerCase();
}

function joinUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getColors(card) {
  if (card.colors?.length) return card.colors;

  if (card.card_faces?.length) {
    return joinUnique(card.card_faces.flatMap((face) => face.colors || []));
  }

  return [];
}

function getFaceText(card) {
  if (!card.card_faces?.length) return null;

  return card.card_faces
    .map((face) => {
      const parts = [
        face.name,
        face.mana_cost,
        face.type_line,
        face.oracle_text,
        [face.power, face.toughness].filter(Boolean).join("/"),
        face.loyalty ? `Loyalty ${face.loyalty}` : null,
        face.defense ? `Defense ${face.defense}` : null,
      ].filter(Boolean);

      return parts.join(" — ");
    })
    .join(" // ");
}

function getPowerToughness(card) {
  if (card.power || card.toughness) {
    return [card.power, card.toughness].filter(Boolean).join("/");
  }

  return null;
}

function compactCard(card) {
  const colors = getColors(card);
  const colorIdentity = card.color_identity || [];

  const result = {
    name: card.name,
    cost: card.mana_cost || null,
    mv: card.cmc,
    colors,
    rarity: card.rarity,
    type: card.type_line,
    text: card.oracle_text || getFaceText(card),
    pt: getPowerToughness(card),
    loyalty: card.loyalty || null,
    defense: card.defense || null,
    keywords: card.keywords || [],
    number: card.collector_number,
  };

  // Include color identity only when it adds information beyond normal colors.
  if (colorIdentity.join("") !== colors.join("")) {
    result.color_identity = colorIdentity;
  }

  // Remove empty/null fields to save context.
  return Object.fromEntries(
    Object.entries(result).filter(([_, value]) => {
      if (value === null || value === undefined) return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (value === "") return false;
      return true;
    })
  );
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: SCRYFALL_HEADERS,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.details || "Scryfall request failed");
    error.status = response.status;
    throw error;
  }

  return data;
}

async function fetchAllCardsForSet(setCode, options) {
  const {
    includeExtras = false,
    includeVariations = false,
  } = options;

  const setInfo = await fetchJson(
    `https://api.scryfall.com/sets/${encodeURIComponent(setCode)}`
  );

  let url = new URL("https://api.scryfall.com/cards/search");
  url.searchParams.set("q", `e:${setInfo.code}`);
  url.searchParams.set("unique", "prints");
  url.searchParams.set("order", "set");
  url.searchParams.set("include_extras", String(includeExtras));
  url.searchParams.set("include_variations", String(includeVariations));

  const cards = [];
  let nextUrl = url.toString();

  while (nextUrl) {
    const page = await fetchJson(nextUrl);

    cards.push(...page.data);
    nextUrl = page.has_more ? page.next_page : null;

    if (nextUrl) {
      await sleep(550);
    }
  }

  return { setInfo, cards };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

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

  try {
    const includeExtras = req.query.includeExtras === "true";
    const includeVariations = req.query.includeVariations === "true";

    const { setInfo, cards } = await fetchAllCardsForSet(setCode, {
      includeExtras,
      includeVariations,
    });

    res.setHeader(
      "Cache-Control",
      "s-maxage=3600, stale-while-revalidate=86400"
    );

    return res.status(200).json({
      set: setInfo.code,
      name: setInfo.name,
      count: cards.length,
      cards: cards.map(compactCard),
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.message,
    });
  }
}
