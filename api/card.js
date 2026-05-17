export default async function handler(req, res) {
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({
      error: "Missing card name"
    });
  }

  const url =
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "mtg-beginner-rules-coach/1.0",
        "Accept": "application/json;q=0.9,*/*;q=0.8"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.details || "Card not found"
      });
    }

    return res.status(200).json({
      name: data.name,
      mana_cost: data.mana_cost,
      type_line: data.type_line,
      oracle_text: data.oracle_text,
      power: data.power,
      toughness: data.toughness,
      loyalty: data.loyalty,
      keywords: data.keywords,
      legalities: data.legalities,
      image: data.image_uris?.normal || null,
      art_crop: data.image_uris?.art_crop || null,
      rulings: data.rulings_uri,
      scryfall: data.scryfall_uri
    });

  } catch (error) {
    return res.status(500).json({
      error: "Internal proxy error",
      details: error.message
    });
  }
}
