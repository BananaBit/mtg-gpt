export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    message: "MTG Scryfall proxy is running. Use /api/card?name=Lightning%20Bolt"
  });
}
