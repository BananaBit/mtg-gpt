import { getSupabaseClient } from "../../lib/supabase.js";

export default async function handler(req, res) {
  // Validate request method
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  // Validate API Key
  const apiKey = req.headers["x-api-key"];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    console.error("API_KEY environment variable is not configured.");
    return res.status(500).json({ error: "Server authentication is not configured" });
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Get location from query string
  const location = req.query.location;
  if (!location || typeof location !== "string") {
    return res.status(400).json({ error: "Missing required query parameter: location" });
  }

  try {
    const supabase = getSupabaseClient();

    // Query owned_cards for matching locations (case-insensitive match)
    const { data: cards, error } = await supabase
      .from("owned_cards")
      .select("name, quantity, set_code, foil, condition, location")
      .ilike("location", location.trim());

    if (error) {
      console.error("Supabase by-location query error:", error);
      return res.status(500).json({ error: `Database query failed: ${error.message}` });
    }

    const totalCards = (cards || []).reduce((sum, copy) => sum + (Number(copy.quantity) || 0), 0);

    return res.status(200).json({
      location: location,
      total_cards: totalCards,
      cards: cards || [],
    });
  } catch (error) {
    console.error("Collection by-location processing error:", error);
    return res.status(500).json({
      error: error.message || "Internal server error during location lookup",
    });
  }
}
