import { analyzeDeck } from "./analyze-service.js";

export async function optimizeDeck({ decklist, format = null, constraints = {} }) {
  const analysis = await analyzeDeck({ decklist, format, includeCollection: constraints.owned_only === true });
  const warnings = [
    "Optimization returns deterministic diagnostics; strategic additions require a supplied candidate pool."
  ];
  if (analysis.unresolved_cards.length) warnings.push("Some cards could not be resolved and were excluded from diagnostics.");
  const suggested_removals = [];
  const suggested_additions = [];
  return { suggested_additions, suggested_removals, diagnostics: analysis, warnings };
}
