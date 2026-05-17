export default async function handler(req, res) {
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({
      error: "Missing card name"
    });
  }

  const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "mtg-beginner-rules-coach/1.0",
      "Accept": "application/json;q=0.9,*/*;q=0.8"
    }
  });

  const data = await response.json();

  return res.status(response.status).json(data);
}
