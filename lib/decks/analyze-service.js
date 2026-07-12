import { parseDecklist, flattenDeck } from "./decklist-parser.js";
import { resolveCards } from "../cards/card-repository.js";
import { checkDeckAgainstCollection } from "../collection/check-deck-service.js";

function cardType(card) {
  return ["Land", "Creature", "Artifact", "Enchantment", "Planeswalker", "Instant", "Sorcery", "Battle"]
    .find((type) => card.type_line?.includes(type)) || "Other";
}

export async function analyzeDeck({ decklist, format = null, includeCollection = false }) {
  const parsed = parseDecklist(decklist);
  const entries = flattenDeck(parsed);
  if (!entries.length) throw new Error("No valid cards found in the provided decklist.");
  const resolved = await resolveCards(entries);
  const unresolved_cards = resolved.filter((card) => !card.scryfall_id).map((card) => card.name);
  const mana_curve = {}, type_distribution = {}, colorIdentity = new Set();
  let land_count = 0;
  for (const card of resolved) {
    const qty = card.quantity;
    const type = cardType(card);
    type_distribution[type] = (type_distribution[type] || 0) + qty;
    if (type === "Land") land_count += qty;
    const manaValue = Number(card.cmc);
    if (Number.isFinite(manaValue) && type !== "Land") {
      const bucket = manaValue >= 7 ? "7+" : String(manaValue);
      mana_curve[bucket] = (mana_curve[bucket] || 0) + qty;
    }
    for (const color of card.color_identity || []) colorIdentity.add(color);
  }
  const result = {
    format, deck_size: entries.reduce((sum, card) => sum + card.quantity, 0),
    color_identity: [...colorIdentity].sort(), mana_curve, land_count,
    type_distribution, unresolved_cards, unparsed_lines: parsed.unparsed_lines
  };
  if (includeCollection) result.collection_coverage = await checkDeckAgainstCollection({ decklist });
  return result;
}
