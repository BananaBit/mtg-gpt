# Serverless Function Consolidation Plan

Status: Draft for implementation  
Target platform: Vercel Hobby  
Target function count: 5  
Primary consumer: Custom GPT Actions

## 1. Purpose

Consolidate the MTG GPT API from 16 Vercel Serverless Functions to 5 while preserving every API path currently exposed in `schema.yaml`.

The consolidation must allow the project to deploy within the Vercel Hobby limit, restore the currently missing nested routes such as `/api/decks/analyze`, and avoid requiring users to reconfigure the Custom GPT Action schema or instructions.

## 2. Problem Statement

Vercel treats every JavaScript entry point under `api/` as a separate Serverless Function. The repository currently contains 16 such files. Production deployments fail because the Hobby plan accepts no more than 12 functions per deployment. The existing production alias therefore points to an older deployment that does not contain the newer card, collection, and deck routes.

The repository also contains legacy and duplicate API entry points that are not exposed to the Custom GPT.

## 3. Goals

1. Reduce the deployed function count from 16 to exactly 5.
2. Preserve all 10 paths and operation IDs in `schema.yaml`.
3. Preserve request methods, parameters, authentication, response bodies, status codes, and caching behavior.
4. Keep one Vercel project, one production domain, and one GPT Action authentication configuration.
5. Remove legacy and duplicate HTTP endpoints.
6. Keep collection import available as a local administrative workflow only.
7. Add automated coverage for consolidated routing and regression-sensitive behavior.
8. Leave capacity for future serverless functions under the Hobby limit.

## 4. Non-Goals

- Splitting the application into multiple Vercel projects.
- Changing business logic in card, collection, deck, or simulation services.
- Changing Supabase, Redis, Scryfall, or authentication credentials.
- Reintroducing collection import into the Custom GPT Action schema.
- Adding a web-based collection administration interface.
- Redesigning API response models.
- Changing GPT behavior or rewriting `gpt/instructions.md` unless an operation name changes unexpectedly.
- Upgrading the Vercel plan.

## 5. Current State

### 5.1 Current function entry points

The following 16 files are deployed as individual functions:

1. `api/card-detail.js`
2. `api/card-image.js`
3. `api/card.js`
4. `api/cards/details.js`
5. `api/cards/search.js`
6. `api/collection/by-location.js`
7. `api/collection/check-deck.js`
8. `api/collection/import-manabox.js`
9. `api/collection/import.js`
10. `api/collection/search.js`
11. `api/collection/stats.js`
12. `api/decks/analyze.js`
13. `api/decks/compare.js`
14. `api/decks/optimize.js`
15. `api/set-cards.js`
16. `api/simulate-pack.js`

### 5.2 GPT-visible operations

`schema.yaml` exposes these 10 operations:

| Method | Public path | Operation ID | Authentication |
|---|---|---|---|
| GET | `/api/cards/search` | `searchCards` | Bearer |
| GET | `/api/cards/details` | `getCardDetails` | Bearer |
| GET | `/api/collection/search` | `searchCollection` | Bearer |
| GET | `/api/collection/stats` | `getCollectionStats` | Bearer |
| POST | `/api/collection/check-deck` | `checkDeckAgainstCollection` | Bearer |
| POST | `/api/decks/analyze` | `analyzeDeck` | Bearer |
| POST | `/api/decks/compare` | `compareDecks` | Bearer |
| POST | `/api/decks/optimize` | `optimizeDeck` | Bearer |
| GET | `/api/set-cards` | `getSetCards` | Public |
| GET | `/api/simulate-pack` | `simulatePack` | Public |

## 6. Target Architecture

### 6.1 Deployed functions

Only these files may remain under `api/`:

```text
api/
├── cards-router.js
├── collection-router.js
├── decks-router.js
├── set-cards.js
└── simulate-pack.js
```

Expected deployed function count: 5.

### 6.2 Route ownership

| Function | Routed operations |
|---|---|
| `api/cards-router.js` | card search and card details |
| `api/collection-router.js` | collection search, collection stats, and deck ownership check |
| `api/decks-router.js` | deck analysis, comparison, and optimization |
| `api/set-cards.js` | set-card pagination and filtering |
| `api/simulate-pack.js` | booster and prerelease simulation |

### 6.3 Request flow

```text
Custom GPT
  -> existing public API path
  -> Vercel rewrite injects an internal operation value
  -> domain router validates operation and method
  -> existing authentication and request validation
  -> existing service layer
  -> unchanged API response
```

The public URL must not redirect. Vercel must internally rewrite it so the Custom GPT continues to call the URLs already defined in `schema.yaml`.

## 7. Vercel Rewrite Specification

Replace the empty `vercel.json` with explicit same-application rewrites:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/api/cards/search", "destination": "/api/cards-router?operation=search" },
    { "source": "/api/cards/details", "destination": "/api/cards-router?operation=details" },
    { "source": "/api/collection/search", "destination": "/api/collection-router?operation=search" },
    { "source": "/api/collection/stats", "destination": "/api/collection-router?operation=stats" },
    { "source": "/api/collection/check-deck", "destination": "/api/collection-router?operation=check-deck" },
    { "source": "/api/decks/analyze", "destination": "/api/decks-router?operation=analyze" },
    { "source": "/api/decks/compare", "destination": "/api/decks-router?operation=compare" },
    { "source": "/api/decks/optimize", "destination": "/api/decks-router?operation=optimize" }
  ]
}
```

Requirements:

- Original query-string parameters must be preserved by the rewrite.
- `operation` is reserved for internal routing and is not added to `schema.yaml`.
- The eight source paths must not exist as files after consolidation because filesystem routes take precedence over rewrites.
- `/api/set-cards` and `/api/simulate-pack` remain direct function routes and require no rewrite.
- The rewrite must be internal; clients must not receive a 3xx response.

## 8. Router Behavior

### 8.1 Shared requirements

Each router must:

1. Read the injected `req.query.operation` value.
2. Select from a fixed allowlist; never dynamically import or execute a user-controlled module name.
3. Apply the same method validation as the original endpoint.
4. Apply authentication exactly once for protected operations.
5. Preserve the original validation order where observable behavior matters.
6. Call the existing service-layer functions without changing their input mapping.
7. Preserve status codes and JSON response shapes.
8. Return a structured 404 error for a missing or unsupported internal operation.
9. Avoid logging API keys, authorization headers, decklists, or collection contents.

Add `ROUTE_NOT_FOUND` to `ErrorCodes` for unsupported router operations. The error response must use the existing `sendError` envelope:

```json
{
  "success": false,
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "API route not found."
  }
}
```

### 8.2 Cards router

#### `operation=search`

- Require `GET`.
- Authenticate with read access.
- Preserve aliases:
  - `number` or `collector_number`
  - `id` or `scryfall_id`
- Call `searchCards` with `set`, `name`, `number`, `id`, `color`, and `type`.
- Preserve the current success envelope containing `items`.
- Preserve the current 500 error behavior.

#### `operation=details`

- Require `GET`.
- Authenticate with read access.
- Accept Scryfall ID, exact name, or set plus collector number.
- Preserve aliases for ID and collector number.
- Return the current ambiguous-resolution 400 error when identifiers are insufficient.
- Call `getCardDetails`.
- Preserve `Cache-Control: s-maxage=3600, stale-while-revalidate=86400`.
- Preserve the existing 404 and 500 mappings.

### 8.3 Collection router

#### `operation=search`

- Require `GET` and authentication.
- Preserve all current filters and the `name` or `query` alias.
- Call `searchCollection` and return its response unchanged.

#### `operation=stats`

- Require `GET` and authentication.
- Call `getCollectionStats` and return its response unchanged.

#### `operation=check-deck`

- Require `POST`, authentication, and JSON-body validation.
- Require a string `decklist`.
- Preserve `match_printing` and `include_locations` semantics.
- Call `checkDeckAgainstCollection` and preserve current 400 behavior for invalid decklists.

### 8.4 Decks router

All deck operations require Bearer authentication.

#### `operation=analyze`

- Require `POST` and a string `decklist`.
- Preserve `format` and `include_collection` mapping.
- Call `analyzeDeck`.
- Preserve current invalid-decklist error behavior.

#### `operation=compare`

- Require `POST`.
- Preserve `deck_a`, `deck_b`, and `include_collection` mapping.
- Call `compareDecks`.
- Preserve current invalid-decklist error behavior.

#### `operation=optimize`

- Require `POST` and a string `decklist`.
- Preserve `format` and `constraints` mapping.
- Call `optimizeDeck`.
- Preserve current invalid-decklist error behavior.

## 9. Endpoint Removal

Delete the following files after their required logic has been preserved by the routers:

```text
api/card.js
api/card-detail.js
api/card-image.js
api/cards/search.js
api/cards/details.js
api/collection/by-location.js
api/collection/check-deck.js
api/collection/import-manabox.js
api/collection/import.js
api/collection/search.js
api/collection/stats.js
api/decks/analyze.js
api/decks/compare.js
api/decks/optimize.js
```

The following removals are intentional breaking changes for legacy callers:

- `/api/card`
- `/api/card-detail`
- `/api/card-image`
- `/api/collection/by-location`
- `/api/collection/import-manabox`
- `/api/collection/import`

They are not present in the Custom GPT schema. Do not add compatibility redirects for them because doing so would retain unsupported API contracts or administrative HTTP access.

## 10. Collection Import Policy

Collection import must remain an administrative, local-only operation through:

```text
scripts/import-manabox-local.js
```

Requirements:

- No import file may remain under `api/`.
- `schema.yaml` must contain no import operation.
- `gpt/instructions.md` must continue to say that imports are administrative and unavailable as GPT Actions.
- `README.md` must document the local script rather than an HTTP import endpoint.
- The import service and validation modules under `lib/collection/imports/` remain intact.
- Existing confirmation, synchronization, validation, and audit behavior in the import service must not change as part of this work.

## 11. Documentation Requirements

Update `README.md` to:

1. Describe the consolidated router architecture.
2. List the 10 stable public GPT routes.
3. Remove examples and claims for `/api/collection/import`.
4. Remove references to `/api/card`, `/api/card-detail`, and other deleted legacy routes.
5. Document collection imports as a local administrative command.
6. State that files under `api/` are function entry points and must remain within the deployment limit.

Do not expand `gpt/instructions.md` unless necessary. If it changes, keep it within the Custom GPT instruction-field limit and report the final character count.

## 12. Schema Compatibility Requirements

`schema.yaml` should require no semantic changes because all public paths remain stable.

Verify that it still has:

- 10 operations.
- One Bearer security scheme.
- `components.schemas` represented as an explicit object, including when empty.
- No collection import endpoint.
- No unsupported Custom GPT schema constructs introduced by this consolidation.
- `x-openai-isConsequential: false` on read-only POST operations.

The consolidation is incomplete if the user must delete and recreate the Action solely because route paths changed.

## 13. Test Plan

### 13.1 Automated tests

Add router-focused tests covering at minimum:

1. Every supported internal operation dispatches to the correct behavior.
2. Unsupported or missing operations return structured 404 responses.
3. Incorrect methods return 405 and the correct `Allow` header.
4. Protected operations return 401 without credentials.
5. Card-search aliases remain supported.
6. Card-details validation and cache headers remain unchanged.
7. Collection search filter mapping remains unchanged.
8. Collection deck-check boolean defaults remain unchanged.
9. Deck analyze, compare, and optimize body mappings remain unchanged.
10. Public set and simulation handlers remain accessible without Bearer authentication.

Tests should mock external service boundaries. They must not require live Supabase, Redis, Scryfall, or Vercel access.

### 13.2 Existing regression tests

Run the full existing suite:

```bash
npm test
```

All existing ManaBox and decklist-parser tests must pass.

### 13.3 Static checks

Verify:

```bash
git diff --check
rg --files api -g '*.js'
```

The second command must list exactly five files and only the target files specified in Section 6.1.

Validate that every `operationId` referenced by `gpt/instructions.md` still exists in `schema.yaml`.

### 13.4 Local routing smoke tests

Run the project through Vercel's local runtime and test the public paths, not the internal router paths.

At minimum:

- An unauthenticated request to each protected GET route returns 401, not 404.
- An unauthenticated request to each protected POST route returns 401 or 405 according to the original validation order, not 404.
- `/api/set-cards` reaches its handler.
- `/api/simulate-pack` reaches its handler.
- An authenticated minimal `/api/decks/analyze` request reaches deck parsing.

### 13.5 Vercel build verification

Run a Vercel production build before deployment. Inspect the generated deployment output or build summary and confirm that exactly five Serverless Functions are bundled.

The implementation must not be considered complete based only on counting source files.

### 13.6 Production smoke tests

After deployment, verify the production domain from `schema.yaml`:

1. All 10 public routes resolve to an application response rather than Vercel `NOT_FOUND`.
2. Protected routes reject missing or invalid Bearer credentials with the application's JSON 401 response.
3. Authenticated card search succeeds.
4. Authenticated collection stats succeeds.
5. Authenticated deck analysis succeeds with a minimal valid decklist.
6. Set-card retrieval and pack simulation reach their handlers.
7. The Vercel deployment summary reports no more than five functions.

Finally, test `analyzeDeck` from the Custom GPT Preview.

## 14. Acceptance Criteria

The work is complete only when all of the following are true:

- [ ] Exactly five JavaScript function entry points remain under `api/`.
- [ ] Vercel accepts and deploys the project on the Hobby plan.
- [ ] The production alias points to the new deployment.
- [ ] All 10 GPT-visible public paths remain unchanged.
- [ ] All 10 `operationId` values remain unchanged.
- [ ] Authentication behavior matches the pre-consolidation handlers.
- [ ] Request and response contracts remain unchanged.
- [ ] Card-details caching behavior remains unchanged.
- [ ] No HTTP collection-import endpoint remains.
- [ ] Local collection import remains documented and usable.
- [ ] Legacy route references are removed from active README documentation.
- [ ] `schema.yaml` remains accepted by the Custom GPT editor.
- [ ] Existing and new automated tests pass.
- [ ] Production smoke tests return application responses rather than Vercel `NOT_FOUND`.
- [ ] The Custom GPT successfully calls `analyzeDeck`.

## 15. Implementation Sequence

Implement in this order:

1. Add router regression tests that capture current handler behavior.
2. Add `ROUTE_NOT_FOUND` to the shared error codes.
3. Create `api/cards-router.js` and migrate the two card handlers.
4. Create `api/collection-router.js` and migrate the three read-only collection handlers.
5. Create `api/decks-router.js` and migrate the three deck handlers.
6. Add explicit rewrites to `vercel.json`.
7. Remove the replaced nested route files.
8. Remove the six legacy or administrative HTTP entry points.
9. Update README documentation.
10. Validate `schema.yaml` and `gpt/instructions.md` consistency.
11. Run automated tests and static checks.
12. Run a local Vercel routing test.
13. Run a Vercel production build and verify the bundled function count.
14. Deploy to production.
15. Run production and Custom GPT smoke tests.

Do not delete old entry points before the routers and rewrites are covered by tests.

## 16. Risks and Mitigations

### Rewrite precedence

Risk: Old filesystem routes prevent rewrites from running.  
Mitigation: Delete the old route files and verify public paths through the Vercel runtime.

### Query-string loss

Risk: Search filters are dropped during a rewrite.  
Mitigation: Add routing tests with original query parameters and production smoke tests using filters.

### Authentication drift

Risk: Consolidation changes whether method or authentication errors occur first.  
Mitigation: Preserve each handler's current validation order and assert it in tests.

### Router exposure

Risk: A caller invokes `/api/cards-router` or another internal destination directly.  
Mitigation: Require a fixed valid operation and preserve authentication for every protected operation. Unsupported operations return 404.

### Function miscount

Risk: Source-file counting differs from Vercel's bundled function count.  
Mitigation: Inspect the actual Vercel build output before production deployment.

### Legacy consumer breakage

Risk: A non-GPT client still uses a deleted legacy endpoint.  
Mitigation: Search the repository before deletion, document the intentional removals, and preserve only the contracts listed in `schema.yaml`.

## 17. Rollback Plan

If the consolidated deployment fails after reaching production:

1. Reassign the production alias to the last known working deployment through Vercel.
2. Preserve logs and the failing deployment for diagnosis.
3. Revert the consolidation commit locally if necessary.
4. Do not restore all 16 functions and attempt another Hobby deployment; the function-limit failure will recur.
5. Fix the router or rewrite problem while retaining a function count below the plan limit, then redeploy and rerun smoke tests.

## 18. Future Extension Rule

New API behavior should normally be added as another operation in an existing domain router, with business logic under `lib/`. A new file under `api/` requires an explicit architectural reason and a documented function-count check.

Keep at least two functions of headroom below the platform limit even if Vercel changes its bundling behavior.
