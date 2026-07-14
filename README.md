# MTG GPT Middleware

A Vercel-hosted Magic: The Gathering middleware for Custom GPT Actions. It combines Scryfall canonical card data, Supabase physical collection ownership, ManaBox CSV synchronization, Redis-backed set data, and deterministic deck utilities.

## Architecture

```text
ManaBox CSV ──► /api/collection ──► Supabase
Custom GPT ──► /api/cards      ──► Scryfall / Redis
           └─► /api/decks      ──► card + collection services
```

The primary domains are:

- `/api/cards`: canonical card search and details.
- `/api/collection`: complete-snapshot imports, ownership search, statistics, and deck coverage.
- `/api/decks`: structured deck analysis, comparison, and optimization diagnostics.

Existing `/api/set-cards` and `/api/simulate-pack` routes continue to use compact Redis set data and local product collation files.

## API routes

| Method | Route | Purpose | Credential |
| --- | --- | --- | --- |
| `GET` | `/api/cards/search` | Search canonical cards | Read |
| `GET` | `/api/cards/details` | Resolve full card details | Read |
| `GET` | `/api/collection/search` | Search active owned cards | Read |
| `GET` | `/api/collection/stats` | Collection totals and grouped statistics | Read |
| `POST` | `/api/collection/check-deck` | Deterministic ownership coverage | Read |
| `POST` | `/api/decks/analyze` | Structured deck facts | Read |
| `POST` | `/api/decks/compare` | Compare two decklists | Read |
| `POST` | `/api/decks/optimize` | Structured optimization diagnostics | Read |
| `GET` | `/api/set-cards` | Compact imported set data | Public legacy tool |
| `GET` | `/api/simulate-pack` | Simulate configured booster products | Public legacy tool |

The old collection routes `import-manabox` and `by-location` remain in the repository for migration compatibility but are not part of the current GPT Action schema. New clients should use the structured routes above.

## Authentication

Protected routes accept either:

```http
Authorization: Bearer <key>
```

or:

```http
X-API-Key: <key>
```

Two backend permission levels are supported:

| Variable | Permission |
| --- | --- |
| `GPT_ACTION_API_KEY` | Card, collection-read, and deck actions |
| `GPT_IMPORT_API_KEY` | Administrative collection synchronization; not exposed in `schema.yaml` |

If `GPT_IMPORT_API_KEY` is omitted, the backend falls back to the read key. Separate credentials are recommended. Configure the Custom GPT Action with `GPT_ACTION_API_KEY`; imports remain an administrative backend/local-script capability.

## Environment variables

### Required for the structured middleware

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
GPT_ACTION_API_KEY
GPT_IMPORT_API_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is accepted as an alias for `SUPABASE_SECRET_KEY`. These values belong only in server-side configuration and must never be placed in `schema.yaml`, GPT instructions, logs, or responses.

### Required for Redis set tools

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

### Optional

| Variable | Default | Purpose |
| --- | ---: | --- |
| `IMPORT_MAX_BYTES` | `5242880` | Maximum raw CSV/request size |
| `IMPORT_MAX_ROWS` | `25000` | Maximum CSV rows and normalized entries |
| `IMPORT_RATE_LIMIT` | `5` | Import attempts per rolling hour |
| `SCRYFALL_USER_AGENT` | `mtg-gpt/1.0` | Scryfall client identification |

Legacy or unrelated endpoints may require additional variables such as `CRON_SECRET` or a Discord webhook if those routes are restored.

## Supabase setup

The collection schema contains:

- `collection_imports`: file hashes, statuses, audit timestamps, change counts, and warnings.
- `owned_cards`: physical ownership identity, printing metadata, quantity, finish, language, condition, location, import lineage, and archival state.
- `sync_collection_snapshot(import_id, entries_json)`: atomic upsert, reactivation, archival, and audit-statistics RPC.

For a fresh database, apply these files in numeric order:

```text
supabase/migrations/001_collection_schema.sql
supabase/migrations/002_collection_indexes.sql
supabase/migrations/003_sync_collection_snapshot.sql
```

The migrations are a fresh target schema, not an automatic upgrade for the earlier legacy tables. If legacy `collection_imports` or `owned_cards` tables already exist, back them up and explicitly migrate or drop them before applying the target schema. Row-level security is enabled and no anonymous write policy is created.

## ManaBox import

`POST /api/collection/import` accepts JSON containing raw CSV text:

```json
{
  "source": "manabox",
  "filename": "Black Binder.csv",
  "csv": "Name,Set code,Collector number,Quantity,Binder Name\n...",
  "mode": "synchronize",
  "confirmed": true
}
```

Example request:

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $GPT_IMPORT_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @request.json \
  "https://your-domain.vercel.app/api/collection/import"
```

The import represents the complete active collection snapshot:

1. Authenticate with import permission.
2. Require `confirmed: true`.
3. Validate source, mode, request size, CSV shape, and row values.
4. Normalize physical attributes and aggregate duplicate ownership entries.
5. Calculate a SHA-256 hash and skip identical completed imports.
6. Atomically insert, update, or reactivate current entries.
7. Archive active entries missing from the new snapshot.
8. Store counts and warnings in the import audit record.

A rejected or failed import does not replace the previous active snapshot. Routine imports never permanently delete collection records.

### Custom GPT boundary

Collection import is intentionally omitted from `schema.yaml`. The Custom GPT may analyze an uploaded CSV, but it cannot modify the stored collection. Run imports through the authenticated administrative endpoint or local script instead.

### Local import

The local script calls the same service used by the HTTP endpoint:

```bash
node --env-file=.env.local \
  scripts/import-manabox-local.js \
  "data/collection/Black Binder - import ready.csv"
```

or, when credentials are available through the normal process environment or `.env`:

```bash
npm run import:manabox -- ./collection.csv
```

## Collection search and statistics

Search supports partial name, Scryfall ID, set, collector number, location, finish, condition, and language filters. Only active rows (`archived_at is null`) are returned.

```bash
curl \
  -H "Authorization: Bearer $GPT_ACTION_API_KEY" \
  "https://your-domain.vercel.app/api/collection/search?location=Black%20Binder&finish=foil"
```

`GET /api/collection/stats` returns active entry count, unique names, total and foil copies, grouped statistics, and the latest completed import.

## Decklists

The shared parser accepts:

```text
1 Card Name
1x Card Name
1 Card Name (SET)
1 Card Name (SET) 123
```

Recognized sections are Commander, Mainboard, Sideboard, Maybeboard, and Companion. Parsed entries preserve quantity, submitted name, printing identifiers, section, and source line number.

- `check-deck` calculates owned, partially owned, and missing quantities deterministically.
- `analyze` returns deck size, color identity, curve, land count, type distribution, unresolved cards, and optional collection coverage.
- `compare` returns shared and exclusive cards plus structured curve/type differences.
- `optimize` returns diagnostics and candidate-change structures; strategic natural-language reasoning remains the GPT's responsibility.

## Card data and set tools

Scryfall remains the canonical authority for card names, oracle data, types, legalities, images, and printing identifiers. Redis stores compact imported set records used by `/api/set-cards`, `/api/card`, `/api/card-detail`, and pack simulation.

Import a compact Scryfall set CSV with:

```bash
npm run import:set -- ./path/to/scryfall-set.csv
```

Pack collation files live under `data/products/<set>/`.

## Custom GPT Actions

Use `schema.yaml` as the action definition and replace its server URL when deploying under a different domain. Configure bearer authentication with the appropriate action key.

Recommended action operation IDs:

```text
searchCards
getCardDetails
searchCollection
getCollectionStats
checkDeckAgainstCollection
analyzeDeck
compareDecks
optimizeDeck
```

The schema also exposes the existing `getSetCards` and `simulatePack` operations. It intentionally does not expose `importCollection`.

## Development and verification

Install dependencies and run tests:

```bash
npm install
npm test
```

Run Vercel functions locally:

```bash
vercel dev
```

Before deployment:

1. Apply and verify the Supabase schema.
2. Test a sanitized first import.
3. Test identical, invalid, changed-quantity, removed-card, and reintroduced-card imports.
4. Test collection search, stats, and deterministic deck coverage.
5. Validate `schema.yaml` and update the Custom GPT Action.
6. Store all secrets in Vercel server-side environment variables.

## Troubleshooting

- Missing `created_at`, `ownership_key`, or `finish` means the legacy Supabase schema is still deployed.
- `fetch failed` during local import usually indicates network restrictions or an invalid Supabase URL.
- `INVALID_COLLECTION_EXPORT` indicates an unsupported source/mode, malformed CSV, invalid row, or exceeded limit.
- Location warnings mean the ManaBox export lacks a Binder/List column; add `Binder Name` before importing if location matters.
- A duplicate file hash returns `status: unchanged` and does not modify collection rows.
- Archived entries are intentionally excluded from normal search and statistics.

## Security notes

- Never expose the Supabase service-role credential to browsers or GPT Actions.
- Never commit `.env` or `.env.local`.
- Do not create anonymous write policies for collection tables.
- Treat collection synchronization as a privileged operation.
- Preserve import history and archive missing entries rather than deleting them.
