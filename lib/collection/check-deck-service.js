import { parseDecklist, flattenDeck } from "../decks/decklist-parser.js";
import { checkCardOwnership } from "./collection-repository.js";

export async function checkDeckAgainstCollection({ decklist, matchPrinting = false, includeLocations = true }) {
  const parsed = parseDecklist(decklist);
  const aggregated = new Map();
  for (const card of flattenDeck(parsed)) {
    const key = matchPrinting
      ? `${card.name.toLowerCase()}|${card.set_code || ""}|${card.collector_number || ""}`
      : card.name.toLowerCase();
    const current = aggregated.get(key) || { ...card, quantity: 0 };
    current.quantity += card.quantity;
    aggregated.set(key, current);
  }
  const requested = [...aggregated.values()];
  if (!requested.length) throw new Error("No valid cards found in the provided decklist.");

  const ownedRows = await checkCardOwnership([...new Set(requested.map((card) => card.name))]);
  const owned = [], partially_owned = [], missing = [];
  let requestedCopies = 0, coveredCopies = 0;
  for (const card of requested) {
    requestedCopies += card.quantity;
    const rows = ownedRows.filter((row) => row.name.toLowerCase() === card.name.toLowerCase())
      .filter((row) => !matchPrinting || (
        (!card.set_code || row.set_code === card.set_code) &&
        (!card.collector_number || row.collector_number === card.collector_number)
      ));
    const available = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const covered = Math.min(card.quantity, available);
    coveredCopies += covered;
    const item = { name: card.name, required: card.quantity, owned: available };
    if (includeLocations) item.locations = [...new Set(rows.map((row) => row.location).filter(Boolean))];
    if (available >= card.quantity) owned.push(item);
    else if (available > 0) partially_owned.push({ ...item, missing: card.quantity - available });
    else missing.push({ name: card.name, required: card.quantity, missing: card.quantity });
  }
  return {
    summary: {
      requested_copies: requestedCopies, owned_copies: coveredCopies,
      missing_copies: requestedCopies - coveredCopies,
      coverage_percent: requestedCopies ? Number((coveredCopies / requestedCopies * 100).toFixed(1)) : 0
    },
    owned, partially_owned, missing, unparsed_lines: parsed.unparsed_lines
  };
}
