import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-secret";
process.env.UPSTASH_REDIS_REST_URL ||= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ||= "test-token";

const { resolveCards } = await import("../lib/cards/card-repository.js");
const { analyzeDeck } = await import("../lib/decks/analyze-service.js");

function card({ id, name, typeLine = "Artifact", cmc = 1, colorIdentity = [] }) {
  return {
    id,
    oracle_id: `oracle-${id}`,
    name,
    set: "tst",
    collector_number: id,
    type_line: typeLine,
    cmc,
    color_identity: colorIdentity,
    scryfall_uri: `https://scryfall.com/card/tst/${id}`
  };
}

function mockCollectionFetch(cardsByName, calls) {
  return async (url, options) => {
    assert.equal(url, "https://api.scryfall.com/cards/collection");
    assert.equal(options.method, "POST");
    const identifiers = JSON.parse(options.body).identifiers;
    calls.push(identifiers);
    const data = identifiers
      .map((identifier) => cardsByName.get(String(identifier.name || "").toLowerCase()))
      .filter(Boolean);
    const notFound = identifiers.filter(
      (identifier) => !cardsByName.has(String(identifier.name || "").toLowerCase())
    );
    return {
      ok: true,
      status: 200,
      json: async () => ({ object: "list", data, not_found: notFound })
    };
  };
}

test("resolves and deduplicates name-only cards with partial failures", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = mockCollectionFetch(new Map([
    ["island", card({ id: "island", name: "Island", typeLine: "Basic Land — Island", cmc: 0, colorIdentity: ["U"] })],
    ["sol ring", card({ id: "sol-ring", name: "Sol Ring" })]
  ]), calls);

  const resolved = await resolveCards([
    { name: "Island", quantity: 15 },
    { name: "Sol Ring", quantity: 1 },
    { name: "island", quantity: 2 },
    { name: "Unknown Card", quantity: 1 }
  ]);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].map((identifier) => identifier.name), ["Island", "Sol Ring", "Unknown Card"]);
  assert.equal(resolved[0].scryfall_id, "island");
  assert.equal(resolved[2].scryfall_id, "island");
  assert.equal(resolved[3].scryfall_id, null);
  assert.equal(resolved[3].resolution_status, "not_found");
});

test("analyzeDeck resolves name-only basic lands and excludes sideboard cards", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = mockCollectionFetch(new Map([
    ["island", card({ id: "island", name: "Island", typeLine: "Basic Land — Island", cmc: 0, colorIdentity: ["U"] })],
    ["mountain", card({ id: "mountain", name: "Mountain", typeLine: "Basic Land — Mountain", cmc: 0, colorIdentity: ["R"] })]
  ]), calls);

  const analysis = await analyzeDeck({
    decklist: "54 Island\n6 Mountain\nSIDEBOARD:\n1 Negate",
    format: "standard"
  });

  assert.equal(calls.length, 1);
  assert.equal(analysis.deck_size, 60);
  assert.equal(analysis.land_count, 60);
  assert.deepEqual(analysis.color_identity, ["R", "U"]);
  assert.deepEqual(analysis.unresolved_cards, []);
});

test("analyzeDeck resolves a Commander-size singleton deck in two batches", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  const cardsByName = new Map(Array.from({ length: 100 }, (_, index) => {
    const name = `Singleton ${index}`;
    return [name.toLowerCase(), card({ id: String(index), name })];
  }));
  globalThis.fetch = mockCollectionFetch(cardsByName, calls);
  const decklist = [
    "COMMANDER:",
    "1 Singleton 0",
    "MAINBOARD:",
    ...Array.from({ length: 99 }, (_, index) => `1 Singleton ${index + 1}`)
  ].join("\n");

  const analysis = await analyzeDeck({ decklist, format: "commander" });

  assert.equal(analysis.deck_size, 100);
  assert.deepEqual(calls.map((batch) => batch.length).sort((a, b) => b - a), [75, 25]);
  assert.deepEqual(analysis.unresolved_cards, []);
});

test("splits more than 75 unique identifiers into bounded Scryfall batches", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  const cardsByName = new Map(Array.from({ length: 76 }, (_, index) => {
    const name = `Card ${index}`;
    return [name.toLowerCase(), card({ id: String(index), name })];
  }));
  globalThis.fetch = mockCollectionFetch(cardsByName, calls);

  const resolved = await resolveCards(Array.from({ length: 76 }, (_, index) => ({
    name: `Card ${index}`,
    quantity: 1
  })));

  assert.deepEqual(calls.map((batch) => batch.length).sort((a, b) => b - a), [75, 1]);
  assert.equal(resolved.filter((entry) => entry.resolution_status === "resolved").length, 76);
});
