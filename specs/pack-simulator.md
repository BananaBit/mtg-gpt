# MTG GPT Pack Simulator — Long-Term Implementation Plan

## Goal

Replace rarity-only booster simulation with explicit, reusable card pool indexes.

The current simulator works as a short-term patch, but it still builds slots mostly from rarity and then filters out basic lands. The long-term solution should build named card pools during CSV import and make product configs reference those pools directly.

This improves correctness, avoids land bugs, and makes future products easier to model.

---

## Current Architecture

The project imports Scryfall CSV data into Upstash Redis.

Current key examples:

```txt
set:msh:cards
set:msh:meta
card:msh:<scryfall_id>
index:msh:name:<slug>
index:msh:number:<collector_number>
index:msh:rarity:<rarity>
index:msh:color:<color>
index:msh:basic_land
```

Current simulator uses product JSON files such as:

```txt
data/products/msh/play_booster.json
```

and endpoint:

```txt
api/simulate-pack.js
```

The problem is that product slots still rely too much on rarity:

```json
{
  "name": "common",
  "count": 7,
  "rarity": ["common"],
  "excludeBasicLands": true
}
```

This works, but is not ideal.

---

## Target Architecture

Create explicit pool indexes during import:

```txt
index:<set>:pool:common_nonland
index:<set>:pool:uncommon_nonland
index:<set>:pool:rare_nonland
index:<set>:pool:mythic_nonland
index:<set>:pool:rare_mythic_nonland
index:<set>:pool:basic_land
index:<set>:pool:booster_eligible
index:<set>:pool:foil_eligible
```

Then product configs use named pools:

```json
{
  "name": "common",
  "count": 7,
  "pool": "common_nonland"
}
```

instead of rarity filters.

---

## Files to Update

### 1. `scripts/import-set-csv.js`

Update the import script to compute card flags and pool indexes.

Each card should include at least:

```js
{
  id,
  set,
  name,
  number,
  rarity,
  mana_cost,
  cmc,
  colors,
  type_line,
  is_basic_land,
  is_land,
  is_booster_eligible,
  is_foil_eligible,
  image_uri,
  scryfall_uri
}
```

Use:

```js
const typeLine = String(row.type_line || "").trim();
const isBasicLand = typeLine.startsWith("Basic Land");
const isLand = typeLine.includes("Land");
```

For now, define:

```js
const isBoosterEligible = true;
const isFoilEligible = true;
```

Later these can become more precise if the CSV includes fields such as promo, borderless, variation, digital, or booster availability.

Build these pool indexes:

```js
if (card.rarity === "common" && !card.is_basic_land) {
  queueIndex(indexes, `index:${setCode}:pool:common_nonland`, card.id);
}

if (card.rarity === "uncommon" && !card.is_basic_land) {
  queueIndex(indexes, `index:${setCode}:pool:uncommon_nonland`, card.id);
}

if (card.rarity === "rare" && !card.is_basic_land) {
  queueIndex(indexes, `index:${setCode}:pool:rare_nonland`, card.id);
  queueIndex(indexes, `index:${setCode}:pool:rare_mythic_nonland`, card.id);
}

if (card.rarity === "mythic" && !card.is_basic_land) {
  queueIndex(indexes, `index:${setCode}:pool:mythic_nonland`, card.id);
  queueIndex(indexes, `index:${setCode}:pool:rare_mythic_nonland`, card.id);
}

if (card.is_basic_land) {
  queueIndex(indexes, `index:${setCode}:pool:basic_land`, card.id);
}

if (card.is_booster_eligible && !card.is_basic_land) {
  queueIndex(indexes, `index:${setCode}:pool:booster_eligible`, card.id);
}

if (card.is_foil_eligible && !card.is_basic_land) {
  queueIndex(indexes, `index:${setCode}:pool:foil_eligible`, card.id);
}
```

Keep the older indexes for backwards compatibility:

```txt
index:<set>:rarity:<rarity>
index:<set>:color:<color>
index:<set>:basic_land
```

---

### 2. `data/products/msh/play_booster.json`

Replace rarity-based slots with pool-based slots.

Suggested starting point:

```json
{
  "set": "msh",
  "type": "play_booster",
  "notes": "Approximate MSH Play Booster model. Uses named card pools instead of rarity-only filters. Refine product-specific slot rules as official collation details are encoded.",
  "slots": [
    {
      "name": "common",
      "count": 7,
      "pool": "common_nonland"
    },
    {
      "name": "uncommon",
      "count": 3,
      "pool": "uncommon_nonland"
    },
    {
      "name": "rare_or_mythic",
      "count": 1,
      "pool": "rare_mythic_nonland",
      "weights": {
        "rare_nonland": 7,
        "mythic_nonland": 1
      }
    },
    {
      "name": "wildcard",
      "count": 2,
      "pool": "booster_eligible"
    },
    {
      "name": "foil",
      "count": 1,
      "pool": "foil_eligible",
      "foil": true
    }
  ]
}
```

Note: if official MSH Play Boosters include a dedicated land slot, add:

```json
{
  "name": "land",
  "count": 1,
  "pool": "basic_land"
}
```

and adjust other slot counts so total card count remains correct.

---

### 3. `api/simulate-pack.js`

Update the simulator so `slot.pool` is the primary mechanism.

Add:

```js
async function getCardsForPool(setCode, poolName) {
  const ids =
    (await redis.get(`index:${setCode}:pool:${poolName}`)) || [];
  return getCardsByIds(setCode, ids);
}
```

Update `getPoolForSlot` to prioritize pools:

```js
async function getPoolForSlot(setCode, slot) {
  if (slot.pool) {
    return getCardsForPool(setCode, slot.pool);
  }

  if (slot.weights) {
    const rarity = weightedRarityChoice(slot.weights);
    return getCardsForRarity(setCode, rarity);
  }

  const rarities = slot.rarity || [];
  const pools = await Promise.all(
    rarities.map(rarity => getCardsForRarity(setCode, rarity))
  );

  return pools.flat();
}
```

However, for weighted slots that reference pools instead of rarities, add a new helper:

```js
function weightedChoice(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);

  let roll = Math.random() * total;

  for (const [key, weight] of entries) {
    roll -= Number(weight);
    if (roll <= 0) return key;
  }

  return entries[0][0];
}
```

Then support:

```json
{
  "poolWeights": {
    "rare_nonland": 7,
    "mythic_nonland": 1
  }
}
```

Recommended slot shape:

```json
{
  "name": "rare_or_mythic",
  "count": 1,
  "poolWeights": {
    "rare_nonland": 7,
    "mythic_nonland": 1
  }
}
```

Then `getPoolForSlot` should do:

```js
if (slot.poolWeights) {
  const poolName = weightedChoice(slot.poolWeights);
  return getCardsForPool(setCode, poolName);
}
```

Final priority order:

```txt
slot.poolWeights
slot.pool
slot.weights + rarity fallback
slot.rarity fallback
```

This preserves backwards compatibility while moving toward explicit pools.

---

### 4. Add `data/products/msh/prerelease_pool.json`

Create a separate product config for prerelease pools.

Suggested:

```json
{
  "set": "msh",
  "type": "prerelease_pool",
  "notes": "A prerelease pool is six Play Boosters plus one traditional foil promo rare or mythic. Basic lands should be treated as available separately for deck building.",
  "contents": [
    {
      "type": "play_booster",
      "count": 6
    },
    {
      "name": "prerelease_promo",
      "count": 1,
      "poolWeights": {
        "rare_nonland": 7,
        "mythic_nonland": 1
      },
      "foil": true,
      "promo": true
    }
  ],
  "deckBuildingNotes": {
    "basicLandsAvailableSeparately": true
  }
}
```

Then extend `api/simulate-pack.js` or create `api/simulate-product.js` to support products made of other products.

Simpler first implementation:

* If `type=prerelease_pool`, call the play booster simulation 6 times internally.
* Add one promo card.
* Return a combined pool.
* Optionally exclude basic lands from the displayed deck-building pool and return them under `basic_lands_available`.

---

## Redis Key Migration

No destructive migration is needed.

Run the importer again after updating it:

```bash
npm run import:set -- ./data/products/msh/scryfall-msh.csv msh
```

This will overwrite card objects and write the new pool indexes.

If desired, old reveal keys can be ignored or deleted later:

```txt
revealed:msh:ids
reveals
seen_cards
```

---

## Testing Plan

### Import test

Run:

```bash
npm run import:set -- ./data/products/msh/scryfall-msh.csv msh
```

Expected:

```txt
Imported X cards into set:msh
```

### Pool tests

Create temporary logs or endpoints to check counts:

```txt
index:msh:pool:common_nonland
index:msh:pool:uncommon_nonland
index:msh:pool:rare_nonland
index:msh:pool:mythic_nonland
index:msh:pool:basic_land
index:msh:pool:booster_eligible
index:msh:pool:foil_eligible
```

Expected:

* `common_nonland` should contain no cards where `type_line.startsWith("Basic Land")`.
* `basic_land` should contain only cards where `type_line.startsWith("Basic Land")`.
* `rare_mythic_nonland` should contain rare and mythic cards only.

### Pack simulation test

Call:

```txt
/api/simulate-pack?set=msh&type=play_booster
```

Expected:

* No basic lands in common/uncommon/wildcard/foil slots.
* If a land slot exists, basic lands only appear there.
* Total card count matches the product config.

### Repeated simulation test

Generate at least 20 simulated packs.

Expected:

* No duplicate cards within a pack unless product config allows duplicates.
* Rarity slots match config.
* No basics appear outside explicit land slots.

### Prerelease test

Call:

```txt
/api/simulate-pack?set=msh&type=prerelease_pool
```

Expected:

* Six booster-equivalent groups or one combined pool.
* One foil promo rare/mythic.
* Basic lands handled separately if configured.

---

## Recommended Custom GPT Behavior

The Custom GPT should:

1. Use `simulatePack` for pack openings.
2. Use `simulatePack` with `type=prerelease_pool` for prerelease pool requests.
3. Treat output as simulated unless exact official collation is explicitly implemented.
4. Never add cards manually.
5. Always include Scryfall links beside card names.
6. Use `getCardDetail` only when full Oracle text is needed.

---

## Future Improvements

Later, improve `is_booster_eligible` and `is_foil_eligible` using better data fields from Scryfall, such as:

* games
* promo
* variation
* digital
* finishes
* booster
* collector_number ranges
* set-specific product slot metadata

Also consider separate indexes for:

```txt
index:<set>:pool:borderless
index:<set>:pool:showcase
index:<set>:pool:foil_rare_mythic
index:<set>:pool:jumpstart_theme:<theme>
index:<set>:pool:special_guest
index:<set>:pool:token
```

This makes Collector Boosters and Jumpstart much easier to model accurately.

---

## Success Criteria

The long-term solution is done when:

1. Product configs use named pools instead of rarity-only filters.
2. Basic lands cannot appear in non-land slots.
3. Pack slot logic is reusable across sets.
4. Prerelease pools are modeled as composed products.
5. The Custom GPT can simulate products through a single Action without inventing card contents.
