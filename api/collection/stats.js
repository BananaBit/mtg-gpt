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

  try {
    const supabase = getSupabaseClient();

    // Retrieve fields required for aggregation
    const { data: allCards, error } = await supabase
      .from("owned_cards")
      .select("name, quantity, foil, condition, location, set_code");

    if (error) {
      console.error("Supabase stats query error:", error);
      return res.status(500).json({ error: `Database stats retrieval failed: ${error.message}` });
    }

    if (!allCards || allCards.length === 0) {
      return res.status(200).json({
        total_unique_cards: 0,
        total_physical_cards: 0,
        by_location: {},
        by_foil: { foil: 0, non_foil: 0 },
        by_condition: {},
        top_sets: {},
      });
    }

    // Accumulators
    const uniqueNames = new Set();
    let totalPhysical = 0;
    const byLocation = {};
    const byFoil = { foil: 0, non_foil: 0 };
    const byCondition = {};
    const bySet = {};

    for (const card of allCards) {
      const qty = Number(card.quantity) || 0;
      if (qty <= 0) continue;

      totalPhysical += qty;

      if (card.name) {
        uniqueNames.add(card.name.trim().toLowerCase());
      }

      // Location breakdown
      const location = card.location || "Unknown Location";
      byLocation[location] = (byLocation[location] || 0) + qty;

      // Foil breakdown
      if (card.foil) {
        byFoil.foil += qty;
      } else {
        byFoil.non_foil += qty;
      }

      // Condition breakdown
      const condition = card.condition || "Unknown Condition";
      byCondition[condition] = (byCondition[condition] || 0) + qty;

      // Set code breakdown
      if (card.set_code) {
        const set = card.set_code.toUpperCase();
        bySet[set] = (bySet[set] || 0) + qty;
      }
    }

    return res.status(200).json({
      total_unique_cards: uniqueNames.size,
      total_physical_cards: totalPhysical,
      by_location: byLocation,
      by_foil: byFoil,
      by_condition: byCondition,
      top_sets: bySet,
    });
  } catch (error) {
    console.error("Collection stats processing error:", error);
    return res.status(500).json({
      error: error.message || "Internal server error during stats processing",
    });
  }
}
