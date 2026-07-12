const SCRYFALL_HEADERS = {
  "User-Agent": process.env.SCRYFALL_USER_AGENT || "mtg-gpt/1.0",
  "Accept": "application/json;q=0.9,*/*;q=0.8"
};

/**
 * Fetches card details from Scryfall API by Scryfall ID.
 * @param {string} id Scryfall UUID
 * @returns {Promise<any>} Card detail object
 */
export async function fetchCardById(id) {
  const response = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(id)}`, {
    headers: SCRYFALL_HEADERS
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.details || data.error || `Scryfall lookup failed with status ${response.status}`);
  }
  return data;
}

/**
 * Searches Scryfall API with a search query string.
 * @param {string} query Search query (e.g. "sol ring")
 * @returns {Promise<any>} Search results array
 */
export async function searchScryfall(query) {
  const response = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`, {
    headers: SCRYFALL_HEADERS
  });

  const data = await response.json();
  if (!response.ok) {
    // If Scryfall returns 404, we return an empty array instead of throwing.
    if (response.status === 404) {
      return { data: [] };
    }
    throw new Error(data.details || data.error || `Scryfall search failed with status ${response.status}`);
  }
  return data;
}

export async function fetchCardByExactName(name, set = null) {
  const url = new URL("https://api.scryfall.com/cards/named");
  url.searchParams.set("exact", name);
  if (set) url.searchParams.set("set", set);
  const response = await fetch(url, { headers: SCRYFALL_HEADERS });
  const data = await response.json();
  if (!response.ok) throw new Error(data.details || `Scryfall lookup failed with status ${response.status}`);
  return data;
}

export async function fetchCardByPrinting(set, number) {
  const response = await fetch(`https://api.scryfall.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(number)}`, { headers: SCRYFALL_HEADERS });
  const data = await response.json();
  if (!response.ok) throw new Error(data.details || `Scryfall lookup failed with status ${response.status}`);
  return data;
}
