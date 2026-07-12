import test from "node:test";
import assert from "node:assert/strict";
import { parseDecklist } from "../lib/decks/decklist-parser.js";

test("parses quantities, sections and printing identifiers", () => {
  const parsed = parseDecklist("Commander\n1 Atraxa, Praetors' Voice (2X2) 190\nMainboard\n4x Sol Ring\nSideboard\n2 Negate");
  assert.equal(parsed.sections.commander[0].collector_number, "190");
  assert.equal(parsed.sections.mainboard[0].quantity, 4);
  assert.equal(parsed.sections.sideboard[0].name, "Negate");
});

test("preserves unparsed line numbers", () => {
  const parsed = parseDecklist("Mainboard\nnot a card line");
  assert.deepEqual(parsed.unparsed_lines, [{ line_number: 2, text: "not a card line" }]);
});
