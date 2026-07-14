# MTG GPT Repository Instructions

These instructions apply to the entire repository. Follow them for planning, implementation, review, testing, and documentation.

## Product Goals

Preserve these outcomes:

1. A Custom GPT answers Magic rules, card-detail, keyword, timing, and interaction questions using verified card data and uploaded rules knowledge.
2. An administrator imports a ManaBox CSV into Supabase so the Custom GPT can query the active collection.
3. The Custom GPT parses decklists, analyzes structure and interactions, checks collection coverage, identifies missing cards, and provides evidence-based replacement suggestions.

Infrastructure refactors must not weaken these goals.

## Source Specifications

Read the relevant specification before implementation:

- `specs/MTG_GPT_ARCHITECTURE_PLAN.md`: original product and data architecture.
- `specs/SERVERLESS_FUNCTION_CONSOLIDATION_PLAN.md`: required five-function Vercel architecture.
- `specs/DECK_ANALYSIS_AND_OPTIMIZATION_EVOLUTION_PLAN.md`: follow-up analysis and collection-aware recommendation design.
- `specs/pack-simulator.md`: pack simulation behavior.

If implementation and an active follow-up specification conflict, follow the newer scoped specification and update stale documentation in the same change.

## Custom GPT Actions Are the API Consumer

Design `schema.yaml` for Custom GPT Actions, not merely for generic OpenAPI compatibility.

Hard platform constraints:

- Action requests have a 45-second round-trip timeout.
- Request and response payloads must each remain below 100,000 characters.
- Requests and responses must be text-based; API responses are JSON.
- Custom headers are unsupported. Use the configured API-key authentication mechanism.
- Use one Bearer authentication scheme. Public operations may override it with `security: []`.
- Endpoint summary and description fields must remain below 300 characters.
- Parameter descriptions, when present, must remain below 700 characters.

Internal engineering targets:

- Finish Action services within 35 seconds in representative performance tests.
- Keep serialized Action responses at or below 80,000 characters.
- Deduplicate, cache, batch, or use bounded concurrency for remote card lookups. Never resolve Commander-size decklists sequentially one card at a time.
- Return compact raw facts and evidence. Let the GPT produce user-facing prose.
- Bound optional lists such as interactions, candidates, and recommendations.
- If response compaction is required, return valid JSON with explicit truncation metadata; never rely on transport truncation.

Official reference: `https://developers.openai.com/api/docs/actions/production`.

## `schema.yaml` Compatibility Rules

The current Custom GPT importer is stricter than a general OpenAPI validator. Preserve these known-compatible patterns:

- Keep OpenAPI `3.1.0` unless a tested migration requires otherwise.
- Keep `components.schemas` present as an explicit object, including when empty: `schemas: {}`.
- Keep exactly one entry under `components.securitySchemes`.
- Do not introduce `$ref`, `oneOf`, `anyOf`, `allOf`, `const`, union `type` arrays, or complex reusable response schemas without proving that the Custom GPT editor accepts them.
- Every object schema must declare `properties`. Avoid property-less object response schemas.
- Prefer response descriptions without detailed response schemas when importer complexity provides no user benefit.
- Quote YAML strings containing colons. Avoid the literal phrase `Magic: The Gathering` in schema summaries or descriptions because it has caused importer formatting failures; use `Magic cards` or a safely quoted value.
- Preserve stable, unique `operationId` values.
- Keep read-only POST operations marked `x-openai-isConsequential: false`.
- Do not add collection-import operations to the Action schema.
- After changing the schema, parse the YAML, count operations and security schemes, check for property-less objects, and test saving it in the Custom GPT editor when possible.

Current GPT-visible operation IDs are:

- `searchCards`
- `getCardDetails`
- `searchCollection`
- `getCollectionStats`
- `checkDeckAgainstCollection`
- `analyzeDeck`
- `compareDecks`
- `optimizeDeck`
- `getSetCards`
- `simulatePack`

Do not rename or remove them without an explicit contract migration covering `schema.yaml`, `gpt/instructions.md`, tests, and the configured GPT.

## GPT Instructions File

`gpt/instructions.md` is pasted into the Custom GPT Instructions field.

- Keep it compact, explicit, and organized by headings and workflows.
- Put behavior and tool-routing rules in instructions; put reference material in uploaded Knowledge files.
- Do not duplicate large API descriptions or Magic rules documents.
- Do not claim capabilities that the deployed services do not implement.
- State that collection imports are administrative and unavailable as GPT Actions.
- When editing it, report `wc -m gpt/instructions.md` and keep substantial headroom below the editor's current limit. Do not assume an undocumented numeric limit is stable.

## Vercel Hobby Function Limit

This project has encountered Vercel's Hobby deployment error limiting a deployment to no more than 12 Serverless Functions.

Repository-specific rules:

- The required post-consolidation architecture has exactly five files under `api/`:
  - `api/cards-router.js`
  - `api/collection-router.js`
  - `api/decks-router.js`
  - `api/set-cards.js`
  - `api/simulate-pack.js`
- Every deployable JavaScript or TypeScript entry point under `api/` counts as a function. Keep shared code under `lib/`.
- Preserve the public paths through internal Vercel rewrites; do not restore one file per public route.
- Do not add a new `api/` entry point when an operation can be dispatched through an existing domain router.
- Target five functions and retain at least two functions of headroom below the observed limit.
- Any proposal for a sixth or later function must document why an existing router is unsuitable and include a build-output count.
- Source-file counts are not sufficient for release. Verify the actual bundled function count in the Vercel build or deployment summary.

The repository may contain the old 16-function layout until `specs/SERVERLESS_FUNCTION_CONSOLIDATION_PLAN.md` is implemented. Do not deploy that layout. Consolidation work must finish with exactly five deployed entry points.

## API Architecture

- Keep API entry points thin: method handling, authentication, validation, service invocation, and response mapping only.
- Put card, collection, deck, simulation, and import business logic under `lib/`.
- Dispatch router operations through fixed allowlists. Never dynamically import a user-supplied path or module name.
- Preserve public methods, parameters, aliases, authentication order, status codes, error envelopes, and cache headers during routing refactors.
- Return structured errors through the shared HTTP helpers.
- Preserve backward-compatible response fields when evolving services; add version fields for materially changed analysis or scoring behavior.

## Card Data and Magic Accuracy

- Treat Scryfall canonical data and returned Oracle text as the source of truth for card facts.
- Never invent card text, identifiers, legality, set contents, keywords, interactions, or Scryfall URLs.
- Keep unresolved cards explicit and continue analysis only where evidence is sufficient.
- Separate deterministic facts and rule checks from heuristics.
- Label deck-performance findings as heuristic; do not claim measured win rates or guaranteed outcomes without real simulation and data.
- Recommendations must expose evidence, reason codes, relevant quantities, and tradeoffs.

## Collection and Import Boundaries

- Supabase is the source of truth for active owned-card quantities and locations.
- Collection queries exposed to the GPT are read-only.
- CSV import is an administrative local workflow through `scripts/import-manabox-local.js` and the services under `lib/collection/imports/`.
- Do not recreate `/api/collection/import` or `/api/collection/import-manabox` unless the user explicitly changes the product boundary and security model.
- Do not expose Supabase service-role credentials to clients or responses.
- Never recommend more owned copies than remain after accounting for deck usage and other recommendations in the same result.
- Archived collection rows must not count as available inventory.

## Security and Secrets

- Never commit `.env`, `.env.local`, API keys, Supabase service-role keys, Redis credentials, or raw authorization headers.
- Bearer authentication uses `GPT_ACTION_API_KEY`, with documented legacy fallback only where already required.
- Keep privileged database access server-side.
- Do not log complete decklists, collection contents, locations, CSV contents, credentials, or authorization headers in production.
- Preserve input-size limits, rate limits, and structured validation for untrusted decklists and CSV data.

## Testing Requirements

For every relevant implementation:

1. Add or update deterministic tests for changed behavior.
2. Mock Scryfall, Redis, Supabase, and Vercel boundaries in unit and service tests.
3. Do not make ordinary test success depend on live credentials or network access.
4. Run:

```bash
npm test
git diff --check
```

For API, schema, or deployment work, also verify:

```bash
rg --files api -g '*.js'
wc -m gpt/instructions.md
```

After consolidation, the API file command must list exactly five entry points. Run a Vercel production build and inspect its generated function count before deployment.

For deck analysis and optimization changes, test at minimum:

- A 60-card deck.
- A Commander-size singleton deck.
- Partial card-resolution failures.
- Collection quantity allocation.
- Response-size budgeting.
- Representative execution time with mocked provider latency.

## Deployment Verification

Do not declare an API change complete after local unit tests alone.

- Confirm the intended commit reached the production deployment.
- Confirm the production alias matches the server URL in `schema.yaml`.
- Smoke-test public paths rather than internal router destinations.
- A protected route without credentials should return the application's JSON 401 response, not Vercel `NOT_FOUND`.
- Verify an authenticated card lookup, collection query, and deck analysis.
- Verify public set-card and pack-simulation operations.
- Test changed operations through Custom GPT Preview.
- If a deployment fails, do not assume production contains the new routes; inspect the deployment summary and alias.

## Documentation Consistency

When behavior changes, update all active surfaces in the same task:

- `README.md`
- `schema.yaml`
- `gpt/instructions.md`
- The relevant specification under `specs/`
- Tests and example commands

Remove documentation for deleted legacy endpoints. Clearly distinguish implemented behavior, planned behavior, and heuristic limitations.

## Completion Standard

A change is complete only when:

- It satisfies the relevant specification and product goal.
- Custom GPT Action constraints are respected.
- Vercel function-count constraints are respected.
- Tests and static checks pass.
- Schema, instructions, and README remain consistent.
- Production verification is performed when deployment is part of the requested scope.
- Known limitations are reported rather than hidden or filled with invented behavior.
