import test from "node:test";
import assert from "node:assert/strict";
import { parseManaBoxCsv } from "../lib/collection/manabox/parse-csv.js";
import { mapRowHeaders } from "../lib/collection/manabox/map-headers.js";
import { normalizeRow } from "../lib/collection/manabox/normalize-row.js";
import { calculateOwnershipKey } from "../lib/collection/ownership-key.js";

test("parses BOM and quoted commas", () => {
  const rows = parseManaBoxCsv('\uFEFFName,Quantity,Set code,Collector Number\r\n"Fire, Ice",2,MH2,123');
  assert.equal(rows[0].Name, "Fire, Ice");
  assert.equal(rows[0].__rowNumber, 2);
});

test("normalizes a ManaBox row", () => {
  const row = normalizeRow(mapRowHeaders({ Name: " Sol Ring ", Quantity: "2", "Set code": "CMM", "Collector Number": "396a", Finish: "Traditional Foil", Language: "English", Condition: "NM", Binder: "Commander" }));
  assert.equal(row.set_code, "cmm");
  assert.equal(row.collector_number, "396a");
  assert.equal(row.finish, "foil");
  assert.equal(row.condition, "near_mint");
});

test("ownership keys distinguish physical properties", () => {
  const base = { scryfall_id: "11111111-1111-1111-1111-111111111111", language: "en", finish: "nonfoil", condition: "near_mint", location: "A" };
  assert.notEqual(calculateOwnershipKey(base), calculateOwnershipKey({ ...base, location: "B" }));
});
