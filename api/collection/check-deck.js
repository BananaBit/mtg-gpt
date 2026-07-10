import { getSupabaseClient } from "../../lib/supabase.js";

// Helper to parse plain text decklist lines into normalized card entries
function parseDecklist(decklistStr) {
  if (!decklistStr || typeof decklistStr !== "string") return [];
  const lines = decklistStr.split(/\r?\n/);
  const parsedCards = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Remove sideboard markers (e.g. "SB: ")
    if (line.startsWith("SB:")) {
      line = line.slice(3).trim();
    }

    // Regex to match quantity and name, support optional "x" separator (e.g. "4 Sol Ring", "4x Sol Ring")
    const match = line.match(/^(\d+)[xX]?\s+(.+)$/);
    let quantity = 1;
    let cardName = line;

    if (match) {
      quantity = parseInt(match[1], 10);
      cardName = match[2].trim();
    }

    // Clean up card name by stripping set and collector number extensions if present:
    // e.g. "Sol Ring (C21) 200" -> "Sol Ring"
    // e.g. "Sol Ring (C21)" -> "Sol Ring"
    const setMatch = cardName.match(/^(.+?)\s+\([a-zA-Z0-9]{3,4}\)\s*\d*$/);
    if (setMatch) {
      cardName = setMatch[1].trim();
    } else {
      const simpleSetMatch = cardName.match(/^(.+?)\s+\([a-zA-Z0-9]{3,4}\)$/);
      if (simpleSetMatch) {
        cardName = simpleSetMatch[1].trim();
      }
    }

    // Strip foil annotations if present (e.g., "*F*", "*foil*")
    cardName = cardName.replace(/\*F\*/gi, "").replace(/\*foil\*/gi, "").trim();

    parsedCards.push({
      name: cardName,
      quantity: Number.isNaN(quantity) ? 1 : quantity,
    });
  }

  return parsedCards;
}

export default async function handler(req, res) {
  // Validate request method
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
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

  // Validate request body
  const { decklist } = req.body || {};
  if (!decklist) {
    return res.status(400).json({ error: "Missing required field: decklist" });
  }

  try {
    // 1. Parse and aggregate decklist
    const parsedCards = parseDecklist(decklist);
    if (parsedCards.length === 0) {
      return res.status(400).json({ error: "No valid cards found in the provided decklist" });
    }

    const aggregatedDeck = new Map();
    for (const card of parsedCards) {
      const lowerName = card.name.toLowerCase();
      if (aggregatedDeck.has(lowerName)) {
        aggregatedDeck.get(lowerName).quantity += card.quantity;
      } else {
        aggregatedDeck.set(lowerName, { name: card.name, quantity: card.quantity });
      }
    }

    const uniqueDeckCards = Array.from(aggregatedDeck.values());
    const deckCardNames = uniqueDeckCards.map((c) => c.name);

    // 2. Query matching cards from collection in a single roundtrip using Supabase
    // Note: Postgrest `.in` is case-sensitive, so we pass unique card names directly.
    const supabase = getSupabaseClient();
    const { data: ownedCards, error } = await supabase
      .from("owned_cards")
      .select("name, quantity, set_code, foil, condition, location, scryfall_id")
      .in("name", deckCardNames);

    if (error) {
      console.error("Supabase check-deck error:", error);
      return res.status(500).json({ error: `Database query failed: ${error.message}` });
    }

    // 3. Build a map of owned cards grouped by lowercase card name
    const ownedMap = new Map();
    for (const card of ownedCards || []) {
      const lowerName = card.name.toLowerCase();
      if (!ownedMap.has(lowerName)) {
        ownedMap.set(lowerName, []);
      }
      ownedMap.get(lowerName).push(card);
    }

    // 4. Calculate coverage and partition lists
    let totalNeededQty = 0;
    let totalOwnedQty = 0;

    const ownedList = [];
    const missingList = [];

    for (const deckItem of uniqueDeckCards) {
      const lowerName = deckItem.name.toLowerCase();
      totalNeededQty += deckItem.quantity;

      const copies = ownedMap.get(lowerName) || [];
      const totalOwnedForCard = copies.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);

      if (totalOwnedForCard > 0) {
        const coveredQty = Math.min(deckItem.quantity, totalOwnedForCard);
        totalOwnedQty += coveredQty;

        ownedList.push({
          name: deckItem.name,
          needed: deckItem.quantity,
          owned: totalOwnedForCard,
          copies: copies.map((c) => ({
            name: c.name,
            quantity: c.quantity,
            set_code: c.set_code,
            foil: c.foil,
            condition: c.condition,
            location: c.location,
          })),
        });
      }

      if (totalOwnedForCard < deckItem.quantity) {
        missingList.push({
          name: deckItem.name,
          needed: deckItem.quantity,
          missing: deckItem.quantity - totalOwnedForCard,
        });
      }
    }

    // 5. Return coverage output
    return res.status(200).json({
      owned: ownedList,
      missing: missingList,
      coverage: {
        needed_cards: totalNeededQty,
        owned_cards: totalOwnedQty,
      },
    });
  } catch (error) {
    console.error("Deck check processing error:", error);
    return res.status(500).json({
      error: error.message || "Internal server error during deck checking",
    });
  }
}
