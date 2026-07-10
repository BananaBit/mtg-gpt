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

  // Get name from query string
  const name = req.query.name || req.query.query;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Missing required query parameter: name" });
  }

  try {
    const supabase = getSupabaseClient();

    // Query owned_cards for cards matching the name (case-insensitive fuzzy match)
    const { data: copies, error } = await supabase
      .from("owned_cards")
      .select("name, quantity, set_code, foil, condition, location")
      .ilike("name", `%${name.trim()}%`);

    if (error) {
      console.error("Supabase search error:", error);
      return res.status(500).json({ error: `Database search failed: ${error.message}` });
    }

    // Calculate total copies owned across matching printings/locations
    const totalOwned = (copies || []).reduce((sum, copy) => sum + (Number(copy.quantity) || 0), 0);

    return res.status(200).json({
      query: name,
      total_owned: totalOwned,
      copies: copies || [],
    });
  } catch (error) {
    console.error("Collection search processing error:", error);
    return res.status(500).json({
      error: error.message || "Internal server error during search processing",
    });
  }
}
