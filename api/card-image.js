export default async function handler(req, res) {
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({ error: "Missing card name" });
  }

  const cardUrl =
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;

  const cardResponse = await fetch(cardUrl, {
    headers: {
      "User-Agent": "mtg-beginner-rules-coach/1.0",
      "Accept": "application/json;q=0.9,*/*;q=0.8"
    }
  });

  const card = await cardResponse.json();

  if (!cardResponse.ok) {
    return res.status(cardResponse.status).json({
      error: card.details || "Card not found"
    });
  }

  const imageUrl =
    card.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.normal;

  if (!imageUrl) {
    return res.status(404).json({ error: "No image available" });
  }

  const imageResponse = await fetch(imageUrl, {
    headers: {
      "User-Agent": "mtg-beginner-rules-coach/1.0",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });

  const imageBuffer = await imageResponse.arrayBuffer();

  res.setHeader("Content-Type", imageResponse.headers.get("content-type") || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");

  return res.status(200).send(Buffer.from(imageBuffer));
}
