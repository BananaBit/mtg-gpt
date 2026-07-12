import { parseDecklist, flattenDeck } from "./decklist-parser.js";
import { analyzeDeck } from "./analyze-service.js";

function quantities(decklist) {
  const map = new Map();
  for (const card of flattenDeck(parseDecklist(decklist))) {
    const key = card.name.toLowerCase();
    const current = map.get(key) || { name: card.name, quantity: 0 };
    current.quantity += card.quantity;
    map.set(key, current);
  }
  return map;
}

export async function compareDecks({ deckA, deckB, includeCollection = false }) {
  const a = quantities(deckA), b = quantities(deckB);
  if (!a.size || !b.size) throw new Error("Both decklists must contain valid cards.");
  const shared_cards = [], only_in_deck_a = [], only_in_deck_b = [];
  for (const [key, card] of a) {
    if (b.has(key)) shared_cards.push({ name: card.name, deck_a: card.quantity, deck_b: b.get(key).quantity });
    else only_in_deck_a.push(card);
  }
  for (const [key, card] of b) if (!a.has(key)) only_in_deck_b.push(card);
  const [analysisA, analysisB] = await Promise.all([
    analyzeDeck({ decklist: deckA, includeCollection }), analyzeDeck({ decklist: deckB, includeCollection })
  ]);
  const result = {
    shared_cards, only_in_deck_a, only_in_deck_b,
    mana_curve_difference: { deck_a: analysisA.mana_curve, deck_b: analysisB.mana_curve },
    type_distribution_difference: { deck_a: analysisA.type_distribution, deck_b: analysisB.type_distribution }
  };
  if (includeCollection) result.collection_coverage = {
    deck_a: analysisA.collection_coverage.summary.coverage_percent,
    deck_b: analysisB.collection_coverage.summary.coverage_percent
  };
  return result;
}
