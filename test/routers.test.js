import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY ||= "test-secret";
process.env.GPT_ACTION_API_KEY ||= "test-action-key";
process.env.UPSTASH_REDIS_REST_URL ||= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ||= "test-token";

const [
  { createCardsRouter },
  { createCollectionRouter },
  { createDecksRouter },
  { default: setCardsHandler },
  { default: simulatePackHandler }
] = await Promise.all([
  import("../api/cards-router.js"),
  import("../api/collection-router.js"),
  import("../api/decks-router.js"),
  import("../api/set-cards.js"),
  import("../api/simulate-pack.js")
]);

function response() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function request({ method = "GET", operation, query = {}, body, headers = {} } = {}) {
  return { method, query: { operation, ...query }, body, headers };
}

const allow = () => ({ level: "read" });

test("cards router dispatches search and preserves aliases", async () => {
  let received;
  const handler = createCardsRouter({
    authenticate: allow,
    search: async filters => {
      received = filters;
      return { items: [{ name: "Sol Ring" }] };
    }
  });
  const res = response();

  await handler(request({
    operation: "search",
    query: { set: "cmm", name: "Sol", collector_number: "396", scryfall_id: "card-id", color: "C", type: "Artifact" }
  }), res);

  assert.deepEqual(received, { set: "cmm", name: "Sol", number: "396", id: "card-id", color: "C", type: "Artifact" });
  assert.deepEqual(res.body, { success: true, items: [{ name: "Sol Ring" }] });
});

test("cards details preserves validation, aliases, and caching", async () => {
  let received;
  const handler = createCardsRouter({
    authenticate: allow,
    getDetails: async identifier => {
      received = identifier;
      return { name: "Sol Ring" };
    }
  });
  const invalid = response();
  await handler(request({ operation: "details" }), invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.error.code, "CARD_RESOLUTION_AMBIGUOUS");

  const valid = response();
  await handler(request({ operation: "details", query: { set: "cmm", collector_number: "396" } }), valid);
  assert.deepEqual(received, { id: undefined, name: undefined, set: "cmm", number: "396" });
  assert.equal(valid.headers["Cache-Control"], "s-maxage=3600, stale-while-revalidate=86400");
  assert.deepEqual(valid.body, { success: true, card: { name: "Sol Ring" } });
});

test("collection router dispatches search filters and stats unchanged", async () => {
  let filters;
  const searchResult = { items: [{ name: "Island" }] };
  const statsResult = { total_copies: 42 };
  const handler = createCollectionRouter({
    authenticate: allow,
    search: async value => (filters = value, searchResult),
    getStats: async () => statsResult
  });

  const searchRes = response();
  await handler(request({ operation: "search", query: {
    query: "Island", set: "fdn", collector_number: "275", location: "Binder", finish: "foil",
    condition: "near_mint", language: "en", scryfall_id: "island-id"
  } }), searchRes);
  assert.deepEqual(filters, {
    name: "Island", setCode: "fdn", collectorNumber: "275", location: "Binder", finish: "foil",
    condition: "near_mint", language: "en", scryfallId: "island-id"
  });
  assert.deepEqual(searchRes.body, searchResult);

  const statsRes = response();
  await handler(request({ operation: "stats" }), statsRes);
  assert.deepEqual(statsRes.body, statsResult);
});

test("collection deck check preserves boolean defaults and explicit values", async () => {
  const calls = [];
  const handler = createCollectionRouter({
    authenticate: allow,
    checkDeck: async value => (calls.push(value), { ok: true })
  });

  await handler(request({ method: "POST", operation: "check-deck", body: { decklist: "1 Sol Ring" } }), response());
  await handler(request({ method: "POST", operation: "check-deck", body: {
    decklist: "1 Island", match_printing: true, include_locations: false
  } }), response());

  assert.deepEqual(calls, [
    { decklist: "1 Sol Ring", matchPrinting: false, includeLocations: true },
    { decklist: "1 Island", matchPrinting: true, includeLocations: false }
  ]);
});

test("decks router dispatches analyze, compare, and optimize mappings", async () => {
  const calls = [];
  const handler = createDecksRouter({
    authenticate: allow,
    analyze: async value => (calls.push(["analyze", value]), { operation: "analyze" }),
    compare: async value => (calls.push(["compare", value]), { operation: "compare" }),
    optimize: async value => (calls.push(["optimize", value]), { operation: "optimize" })
  });

  await handler(request({ method: "POST", operation: "analyze", body: {
    decklist: "1 Sol Ring", format: "commander", include_collection: true
  } }), response());
  await handler(request({ method: "POST", operation: "compare", body: {
    deck_a: "1 Island", deck_b: "1 Mountain", include_collection: true
  } }), response());
  await handler(request({ method: "POST", operation: "optimize", body: {
    decklist: "1 Forest", format: "standard", constraints: { owned_only: true }
  } }), response());

  assert.deepEqual(calls, [
    ["analyze", { decklist: "1 Sol Ring", format: "commander", includeCollection: true }],
    ["compare", { deckA: "1 Island", deckB: "1 Mountain", includeCollection: true }],
    ["optimize", { decklist: "1 Forest", format: "standard", constraints: { owned_only: true } }]
  ]);
});

test("all routers return a structured 404 for missing or unsupported operations", async () => {
  for (const handler of [
    createCardsRouter({ authenticate: allow }),
    createCollectionRouter({ authenticate: allow }),
    createDecksRouter({ authenticate: allow })
  ]) {
    for (const operation of [undefined, "unsupported", "toString", "__proto__", ["search"]]) {
      const res = response();
      await handler(request({ operation }), res);
      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, {
        success: false,
        error: { code: "ROUTE_NOT_FOUND", message: "API route not found." }
      });
    }
  }
});

test("routers preserve 405 responses and Allow headers", async () => {
  const cases = [
    [createCardsRouter({ authenticate: allow }), "POST", "search", "GET"],
    [createCollectionRouter({ authenticate: allow }), "GET", "check-deck", "POST"],
    [createDecksRouter({ authenticate: allow }), "GET", "analyze", "POST"]
  ];
  for (const [handler, method, operation, expected] of cases) {
    const res = response();
    await handler(request({ method, operation }), res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.Allow, expected);
    assert.equal(res.body.error.code, "METHOD_NOT_ALLOWED");
  }
});

test("all protected operations reject missing credentials", async () => {
  const cases = [
    [createCardsRouter(), "GET", "search"],
    [createCardsRouter(), "GET", "details"],
    [createCollectionRouter(), "GET", "search"],
    [createCollectionRouter(), "GET", "stats"],
    [createCollectionRouter(), "POST", "check-deck"],
    [createDecksRouter(), "POST", "analyze"],
    [createDecksRouter(), "POST", "compare"],
    [createDecksRouter(), "POST", "optimize"]
  ];
  for (const [handler, method, operation] of cases) {
    const res = response();
    await handler(request({ method, operation }), res);
    assert.equal(res.statusCode, 401, operation);
    assert.equal(res.body.error.code, "UNAUTHORIZED");
  }
});

test("public set and simulation handlers are accessible without credentials", async () => {
  for (const handler of [setCardsHandler, simulatePackHandler]) {
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 400);
    assert.notEqual(res.body.error, "Unauthorized");
  }
});

test("Vercel rewrites map every protected public path to its router", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.rewrites, [
    { source: "/api/cards/search", destination: "/api/cards-router?operation=search" },
    { source: "/api/cards/details", destination: "/api/cards-router?operation=details" },
    { source: "/api/collection/search", destination: "/api/collection-router?operation=search" },
    { source: "/api/collection/stats", destination: "/api/collection-router?operation=stats" },
    { source: "/api/collection/check-deck", destination: "/api/collection-router?operation=check-deck" },
    { source: "/api/decks/analyze", destination: "/api/decks-router?operation=analyze" },
    { source: "/api/decks/compare", destination: "/api/decks-router?operation=compare" },
    { source: "/api/decks/optimize", destination: "/api/decks-router?operation=optimize" }
  ]);
});
