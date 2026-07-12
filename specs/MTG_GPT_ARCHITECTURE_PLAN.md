# MTG GPT Middleware Architecture and Collection Integration Plan

## 1. Purpose

This document defines the target architecture and implementation plan for evolving the existing `mtg-gpt` repository into a structured MTG middleware service.

The middleware will support three primary domains:

```text
/api
  /cards
    search
    details

  /collection
    import
    search
    stats
    check-deck

  /decks
    analyze
    compare
    optimize
```

The system will integrate:

* ManaBox for scanning and managing physical cards
* Supabase for persistent collection data
* Scryfall for canonical Magic card information
* Vercel for API hosting
* Custom GPT Actions for collection and deck operations

The Custom GPT will be permitted to initiate a ManaBox collection import when the user provides a CSV file and explicitly asks for it to be imported.

No standalone frontend is required.

---

# 2. Core Design Principles

## 2.1 Clear domain separation

The API is divided into three domains:

* `/api/cards`: card lookup and canonical card details
* `/api/collection`: physical collection management
* `/api/decks`: deck analysis and recommendations

Each domain should contain purpose-focused endpoints and supporting services.

## 2.2 Thin API handlers

API handlers should only:

1. Validate the HTTP request.
2. Authenticate the caller.
3. Parse request-level input.
4. Call a service.
5. Return a response.

API handlers should not contain:

* CSV normalization
* SQL queries
* Deck comparison logic
* Scryfall mapping logic
* Business rules

## 2.3 Supabase as the collection data store

Supabase stores:

* Imported collection entries
* Collection import history
* Physical card metadata
* Import warnings
* Active and archived collection records

Supabase does not replace Scryfall as the source of canonical card information.

## 2.4 Scryfall as the card authority

Scryfall should provide:

* Oracle card names
* Oracle text
* Card types
* Legalities
* Set and collector-number data
* Card images
* Scryfall identifiers

The collection database should primarily store ownership information rather than duplicate every Scryfall field.

## 2.5 ManaBox remains the scanning tool

ManaBox is responsible for:

* Scanning physical cards
* Maintaining binders and lists
* Tracking finishes, conditions and languages
* Exporting collection data as CSV

The middleware imports ManaBox exports into Supabase.

---

# 3. Target Architecture

```text
                         ┌─────────────────────┐
                         │      ManaBox        │
                         │                     │
                         │ Scan and organize   │
                         │ physical cards      │
                         └──────────┬──────────┘
                                    │
                             Export CSV
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Custom GPT       │
                         │                     │
                         │ User uploads CSV    │
                         │ and requests import │
                         └──────────┬──────────┘
                                    │ GPT Action
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Vercel MTG Middleware                       │
│                                                                 │
│  /api/cards                                                     │
│    search                                                       │
│    details                                                      │
│                                                                 │
│  /api/collection                                                │
│    import                                                       │
│    search                                                       │
│    stats                                                        │
│    check-deck                                                   │
│                                                                 │
│  /api/decks                                                     │
│    analyze                                                      │
│    compare                                                      │
│    optimize                                                     │
│                                                                 │
│  Supporting services                                            │
│                                                                 │
│  authentication                                                 │
│  ManaBox parser                                                 │
│  collection importer                                            │
│  collection repository                                          │
│  deck parser                                                    │
│  card resolver                                                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
          ┌──────────────────┐    ┌──────────────────┐
          │    Supabase      │    │    Scryfall      │
          │                  │    │                  │
          │ Collection       │    │ Oracle data      │
          │ Import history   │    │ Card identity    │
          │ Deck metadata    │    │ Legalities       │
          └──────────────────┘    └──────────────────┘
```

---

# 4. Proposed Repository Structure

```text
mtg-gpt/
├── api/
│   ├── cards/
│   │   ├── search.js
│   │   └── details.js
│   │
│   ├── collection/
│   │   ├── import.js
│   │   ├── search.js
│   │   ├── stats.js
│   │   └── check-deck.js
│   │
│   └── decks/
│       ├── analyze.js
│       ├── compare.js
│       └── optimize.js
│
├── lib/
│   ├── auth/
│   │   ├── authenticate-action.js
│   │   ├── require-import-permission.js
│   │   └── verify-import-confirmation.js
│   │
│   ├── cards/
│   │   ├── card-service.js
│   │   ├── card-repository.js
│   │   └── scryfall-client.js
│   │
│   ├── collection/
│   │   ├── imports/
│   │   │   ├── import-service.js
│   │   │   ├── import-validator.js
│   │   │   ├── import-result.js
│   │   │   └── collection-sync.js
│   │   │
│   │   ├── manabox/
│   │   │   ├── parse-csv.js
│   │   │   ├── map-headers.js
│   │   │   ├── normalize-row.js
│   │   │   └── detect-format.js
│   │   │
│   │   ├── collection-repository.js
│   │   ├── search-service.js
│   │   ├── stats-service.js
│   │   ├── ownership-key.js
│   │   └── check-deck-service.js
│   │
│   ├── decks/
│   │   ├── decklist-parser.js
│   │   ├── analyze-service.js
│   │   ├── compare-service.js
│   │   └── optimize-service.js
│   │
│   ├── database/
│   │   └── supabase-admin.js
│   │
│   └── http/
│       ├── errors.js
│       ├── response.js
│       ├── request-body.js
│       └── method.js
│
├── supabase/
│   └── migrations/
│       ├── 001_collection_schema.sql
│       ├── 002_collection_indexes.sql
│       └── 003_sync_collection_snapshot.sql
│
├── test/
│   ├── fixtures/
│   │   ├── manabox-valid.csv
│   │   ├── manabox-invalid.csv
│   │   └── manabox-duplicates.csv
│   │
│   ├── collection/
│   │   ├── parse-csv.test.js
│   │   ├── normalize-row.test.js
│   │   ├── import-service.test.js
│   │   └── check-deck-service.test.js
│   │
│   └── decks/
│       └── decklist-parser.test.js
│
├── scripts/
│   └── import-manabox-local.js
│
├── schema.yaml
├── package.json
├── vercel.json
└── README.md
```

---

# 5. API Domain Responsibilities

## 5.1 Cards domain

```text
/api/cards
```

The cards domain handles canonical card data.

### `GET /api/cards/search`

Searches for cards using:

* Card name
* Partial name
* Set
* Color
* Type
* Other supported filters

Example request:

```http
GET /api/cards/search?name=sol%20ring
```

Example response:

```json
{
  "items": [
    {
      "name": "Sol Ring",
      "scryfall_id": "example-uuid",
      "set_code": "cmm",
      "collector_number": "396",
      "type_line": "Artifact",
      "scryfall_uri": "https://scryfall.com/..."
    }
  ]
}
```

### `GET /api/cards/details`

Returns complete card information for a verified card.

Accepted identifiers should include:

* Scryfall ID
* Exact card name
* Set code plus collector number

Example:

```http
GET /api/cards/details?scryfall_id=example-uuid
```

This endpoint replaces or reorganizes existing card-detail functionality without changing Scryfall’s role as the card authority.

---

# 6. Collection Domain

```text
/api/collection
```

The collection domain manages physical card ownership.

It is responsible for:

* ManaBox imports
* Collection searches
* Collection statistics
* Deck ownership checks

---

# 7. GPT-Enabled ManaBox Import

## 7.1 Endpoint

```text
POST /api/collection/import
```

This endpoint replaces the externally visible name `import-manabox` with a more general collection import route.

The request identifies the source:

```json
{
  "source": "manabox"
}
```

Internally, the request is delegated to the ManaBox parser.

This makes it possible to support additional sources later:

```json
{
  "source": "archidekt"
}
```

or:

```json
{
  "source": "moxfield"
}
```

The first supported source will be `manabox`.

## 7.2 GPT Action behavior

The Custom GPT may invoke the import endpoint when:

1. The user provides a ManaBox CSV.
2. The user explicitly asks to import or synchronize the collection.
3. The GPT identifies the file as a supported CSV.
4. The GPT informs the user that the import will update the active collection snapshot.
5. The user’s request already constitutes confirmation.

Examples of valid user requests:

```text
Import this ManaBox CSV into my collection.
```

```text
Synchronize my collection using the attached ManaBox export.
```

```text
Replace the current collection snapshot with this ManaBox file.
```

The GPT should not invoke the import action when the user only asks:

```text
What is in this CSV?
```

```text
Can you inspect this export?
```

```text
How many cards are in this file?
```

Those are analysis requests, not import requests.

## 7.3 Import request formats

The preferred request format depends on how the GPT Action passes file content.

The backend should support at least one reliable representation:

### Option A: Raw CSV content

```json
{
  "source": "manabox",
  "filename": "collection.csv",
  "csv": "Name,Set code,Quantity,..."
}
```

This is the simplest GPT Action contract when the GPT can read the attached CSV and pass its text contents.

### Option B: Base64-encoded CSV

```json
{
  "source": "manabox",
  "filename": "collection.csv",
  "content_encoding": "base64",
  "content": "TmFtZSxTZXQgY29kZSxRdWFudGl0eS..."
}
```

Use this only when raw text causes transport or escaping problems.

### Option C: Signed upload reference

```json
{
  "source": "manabox",
  "filename": "collection.csv",
  "file_url": "https://signed-storage-url..."
}
```

This is more scalable but introduces additional storage and URL-validation requirements.

For a collection of approximately 500 cards, raw CSV content is the recommended first implementation.

## 7.4 Suggested request schema

```json
{
  "source": "manabox",
  "filename": "manabox-collection.csv",
  "csv": "Name,Set code,Collector number,Quantity,...",
  "mode": "synchronize",
  "confirmed": true
}
```

Fields:

| Field       | Required | Description                        |
| ----------- | -------: | ---------------------------------- |
| `source`    |      Yes | Import source; initially `manabox` |
| `filename`  |       No | Original filename                  |
| `csv`       |      Yes | Raw CSV text                       |
| `mode`      |      Yes | Initially only `synchronize`       |
| `confirmed` |      Yes | Indicates explicit user intent     |

The API must not rely only on the GPT’s wording for safety. It should require:

```json
{
  "confirmed": true
}
```

## 7.5 Authentication

The import endpoint is available to the GPT but requires stronger authorization than read-only collection actions.

Use a dedicated credential:

```text
GPT_IMPORT_API_KEY
```

Read-only actions use:

```text
GPT_ACTION_API_KEY
```

This creates two permission levels:

| Credential           | Permissions                              |
| -------------------- | ---------------------------------------- |
| `GPT_ACTION_API_KEY` | Search, stats, check-deck, deck analysis |
| `GPT_IMPORT_API_KEY` | Collection import and synchronization    |

The Custom GPT Action configuration may use one shared authentication mechanism if the platform does not support per-operation credentials. In that case, the backend must still enforce:

* Explicit `confirmed: true`
* Supported source
* File-size limits
* CSV validation
* Import rate limits
* Audit logging

## 7.6 Import endpoint response

Example successful response:

```json
{
  "success": true,
  "status": "completed",
  "import_id": "example-uuid",
  "source": "manabox",
  "filename": "manabox-collection.csv",
  "source_rows": 503,
  "normalized_entries": 487,
  "total_copies": 514,
  "inserted_entries": 12,
  "updated_entries": 7,
  "unchanged_entries": 466,
  "archived_entries": 2,
  "warning_count": 1,
  "warnings": [
    {
      "row": 41,
      "code": "MISSING_SCRYFALL_ID",
      "message": "The card was imported using set and collector number."
    }
  ]
}
```

Example unchanged response:

```json
{
  "success": true,
  "status": "unchanged",
  "message": "This exact ManaBox export has already been imported.",
  "previous_import_id": "example-uuid"
}
```

Example validation failure:

```json
{
  "success": false,
  "status": "rejected",
  "errors": [
    {
      "row": 18,
      "field": "quantity",
      "code": "INVALID_QUANTITY",
      "message": "Quantity must be a positive integer."
    }
  ]
}
```

A rejected import must not modify the active collection.

---

# 8. Import Processing Pipeline

```text
GPT Action request
        │
        ▼
Authenticate action
        │
        ▼
Verify explicit confirmation
        │
        ▼
Validate source and file size
        │
        ▼
Detect ManaBox format
        │
        ▼
Parse CSV
        │
        ▼
Map headers
        │
        ▼
Normalize rows
        │
        ▼
Validate entries
        │
        ▼
Aggregate duplicate ownership entries
        │
        ▼
Calculate file hash
        │
        ▼
Synchronize collection snapshot
        │
        ▼
Return import summary
```

---

# 9. ManaBox Parser Components

## 9.1 `detect-format.js`

Determines whether the CSV resembles a supported ManaBox export.

Checks should include:

* Header row exists.
* Card name column is present.
* Quantity column is present.
* At least one printing identifier is present where available.
* CSV contains at least one nonempty data row.

Example result:

```json
{
  "supported": true,
  "source": "manabox",
  "confidence": "high"
}
```

Do not silently import an unknown CSV format.

## 9.2 `parse-csv.js`

Parses raw CSV into row objects.

Recommended behavior:

* Support UTF-8 BOM.
* Support quoted fields containing commas.
* Skip empty lines.
* Preserve row numbers.
* Reject malformed column counts.
* Limit the maximum row count.

Example:

```js
import { parse } from "csv-parse/sync";

export function parseManaBoxCsv(csvText) {
  return parse(csvText, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false
  }).map((row, index) => ({
    ...row,
    __rowNumber: index + 2
  }));
}
```

## 9.3 `map-headers.js`

Maps possible ManaBox headers into internal field names.

Example aliases:

```js
export const MANA_BOX_FIELD_ALIASES = {
  name: [
    "Name",
    "Card Name"
  ],

  quantity: [
    "Quantity",
    "Count"
  ],

  scryfallId: [
    "Scryfall ID",
    "Scryfall Id",
    "ScryfallID"
  ],

  setCode: [
    "Set code",
    "Set Code",
    "Set"
  ],

  collectorNumber: [
    "Collector Number",
    "Collector number"
  ],

  language: [
    "Language"
  ],

  condition: [
    "Condition"
  ],

  foil: [
    "Foil",
    "Finish"
  ],

  location: [
    "Binder Name",
    "Binder",
    "List Name",
    "List"
  ]
};
```

Required canonical fields:

* `name`
* `quantity`

Strongly preferred fields:

* `scryfallId`
* `setCode`
* `collectorNumber`

## 9.4 `normalize-row.js`

Converts raw ManaBox values into the internal collection model.

Example normalized object:

```json
{
  "row_number": 2,
  "scryfall_id": "example-uuid",
  "name": "Sol Ring",
  "set_code": "cmm",
  "collector_number": "396",
  "quantity": 1,
  "finish": "nonfoil",
  "language": "en",
  "condition": "near_mint",
  "location": "Commander Binder"
}
```

Normalization rules:

* Trim text values.
* Lowercase set codes.
* Normalize UUID casing.
* Parse quantity as a positive integer.
* Convert finish into:

  * `nonfoil`
  * `foil`
  * `etched`
* Normalize blank locations to `Unassigned`.
* Normalize language to a known code.
* Normalize condition to a finite internal vocabulary.
* Preserve collector-number suffixes.
* Do not guess a Scryfall ID when the available data is ambiguous.

## 9.5 `import-validator.js`

Separate errors from warnings.

### Errors

Errors reject the complete import.

Examples:

* Missing card name
* Quantity is zero or negative
* Quantity is not an integer
* Required headers are missing
* CSV is malformed
* No valid data rows
* Unsupported import source

### Warnings

Warnings allow the import to continue.

Examples:

* Missing Scryfall ID
* Unknown condition
* Missing binder/list
* Card resolved using set and collector number
* Card imported with incomplete printing metadata

---

# 10. Ownership Identity

An ownership entry represents copies that share the same physical characteristics.

Preferred ownership key:

```text
scryfall_id
+ language
+ finish
+ condition
+ location
```

Fallback ownership key:

```text
normalized card name
+ set code
+ collector number
+ language
+ finish
+ condition
+ location
```

Example implementation input:

```json
{
  "scryfall_id": "example-uuid",
  "language": "en",
  "finish": "foil",
  "condition": "near_mint",
  "location": "Rare Binder"
}
```

Do not use only the Scryfall ID.

The same printing may exist in:

* Multiple binders
* Different conditions
* Different languages
* Foil and nonfoil versions

These should remain separate ownership entries.

---

# 11. Supabase Schema

## 11.1 `collection_imports`

Tracks every import attempt.

```sql
create table public.collection_imports (
  id uuid primary key default gen_random_uuid(),

  source text not null,

  filename text,
  file_hash text,

  status text not null
    check (
      status in (
        'processing',
        'completed',
        'failed',
        'rejected',
        'unchanged'
      )
    ),

  initiated_by text not null default 'gpt_action',

  source_rows integer not null default 0,
  normalized_entries integer not null default 0,
  total_copies integer not null default 0,

  inserted_entries integer not null default 0,
  updated_entries integer not null default 0,
  unchanged_entries integer not null default 0,
  archived_entries integer not null default 0,

  warning_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,

  error_message text,

  created_at timestamptz not null default now(),
  completed_at timestamptz
);
```

Create an index on completed file hashes:

```sql
create index collection_imports_file_hash_idx
on public.collection_imports (file_hash)
where status = 'completed';
```

## 11.2 `owned_cards`

```sql
create table public.owned_cards (
  id uuid primary key default gen_random_uuid(),

  ownership_key text not null,

  scryfall_id uuid,
  oracle_id uuid,

  name text not null,
  set_code text,
  collector_number text,

  quantity integer not null
    check (quantity > 0),

  finish text not null default 'nonfoil'
    check (
      finish in (
        'nonfoil',
        'foil',
        'etched'
      )
    ),

  language text not null default 'en',
  condition text,
  location text not null default 'Unassigned',

  first_seen_import_id uuid
    references public.collection_imports(id),

  last_seen_import_id uuid not null
    references public.collection_imports(id),

  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Create a unique active ownership index:

```sql
create unique index owned_cards_active_ownership_key_idx
on public.owned_cards (ownership_key)
where archived_at is null;
```

Useful indexes:

```sql
create index owned_cards_name_idx
on public.owned_cards (lower(name))
where archived_at is null;

create index owned_cards_scryfall_id_idx
on public.owned_cards (scryfall_id)
where archived_at is null;

create index owned_cards_location_idx
on public.owned_cards (location)
where archived_at is null;
```

## 11.3 Row-level security

```sql
alter table public.collection_imports enable row level security;
alter table public.owned_cards enable row level security;
```

The server-side Supabase Secret Key may access these tables through trusted Vercel functions.

Do not create anonymous write policies.

---

# 12. Snapshot Synchronization

The imported ManaBox file represents a complete collection snapshot.

The synchronization process should be atomic.

## 12.1 File hashing

Calculate a SHA-256 hash of the original CSV content.

If the latest successful import has the same hash:

* Do not modify collection records.
* Mark or return the import as unchanged.
* Return the previous import identifier.

## 12.2 Upsert behavior

For each aggregated ownership entry:

### New ownership key

Insert:

* Current quantity
* Physical properties
* `first_seen_import_id`
* `last_seen_import_id`

### Existing ownership key

Update:

* Quantity
* Imported metadata
* `last_seen_import_id`
* `updated_at`

Preserve:

* Stable row ID
* `first_seen_import_id`

Clear `archived_at` if the entry had previously been archived.

## 12.3 Archive missing entries

After processing the new snapshot, archive active entries not seen in the new import:

```sql
update public.owned_cards
set
  archived_at = now(),
  updated_at = now()
where archived_at is null
  and last_seen_import_id <> current_import_id;
```

Do not permanently delete collection records during routine imports.

## 12.4 Transactional database function

Implement the synchronization in a Supabase PostgreSQL function:

```text
sync_collection_snapshot(import_id, entries_json)
```

The function should atomically:

1. Upsert current entries.
2. Unarchive entries that reappear.
3. Archive entries absent from the new snapshot.
4. Update import statistics.
5. Mark the import as completed.

If any step fails, the transaction should roll back.

The previous active collection must remain intact after a failed import.

---

# 13. Collection Endpoints

## 13.1 Import

```text
POST /api/collection/import
```

Responsibilities:

* Authenticate the GPT Action.
* Verify explicit import confirmation.
* Validate request size.
* Route by source.
* Call the appropriate parser.
* Synchronize the collection.
* Return a summary.

The route should not contain source-specific parsing logic.

Conceptual handler:

```js
import { authenticateAction } from "../../lib/auth/authenticate-action.js";
import { requireImportPermission } from "../../lib/auth/require-import-permission.js";
import { importCollection } from "../../lib/collection/imports/import-service.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const caller = authenticateAction(req);
  requireImportPermission(caller);

  const result = await importCollection({
    source: req.body.source,
    filename: req.body.filename,
    csv: req.body.csv,
    mode: req.body.mode,
    confirmed: req.body.confirmed
  });

  return res.status(200).json(result);
}
```

## 13.2 Search collection

```text
GET /api/collection/search
```

Supported filters:

* Name
* Exact or partial match
* Scryfall ID
* Set code
* Collector number
* Location
* Finish
* Condition
* Language

Example:

```http
GET /api/collection/search?name=sol%20ring
```

Response:

```json
{
  "query": {
    "name": "sol ring"
  },
  "total_entries": 2,
  "total_copies": 3,
  "items": [
    {
      "scryfall_id": "example-uuid",
      "name": "Sol Ring",
      "set_code": "cmm",
      "collector_number": "396",
      "quantity": 2,
      "finish": "nonfoil",
      "condition": "near_mint",
      "language": "en",
      "location": "Commander Binder"
    }
  ]
}
```

Only active records should be returned unless an administrative parameter explicitly requests archived records.

## 13.3 Collection statistics

```text
GET /api/collection/stats
```

Response:

```json
{
  "distinct_entries": 482,
  "unique_card_names": 451,
  "total_copies": 517,
  "foil_copies": 22,
  "locations": 4,
  "last_import": {
    "id": "example-uuid",
    "source": "manabox",
    "completed_at": "2026-07-11T14:00:00Z"
  }
}
```

Optional grouped statistics:

* Copies by location
* Copies by finish
* Copies by set
* Copies by condition
* Copies by language

Avoid adding dynamic market prices to the MVP.

## 13.4 Check deck against collection

```text
POST /api/collection/check-deck
```

Request:

```json
{
  "decklist": "1 Sol Ring\n2 Lightning Bolt",
  "match_printing": false,
  "include_locations": true
}
```

Response:

```json
{
  "summary": {
    "requested_copies": 3,
    "owned_copies": 2,
    "missing_copies": 1,
    "coverage_percent": 66.7
  },

  "owned": [
    {
      "name": "Sol Ring",
      "required": 1,
      "owned": 1,
      "locations": [
        "Commander Binder"
      ]
    }
  ],

  "partially_owned": [
    {
      "name": "Lightning Bolt",
      "required": 2,
      "owned": 1,
      "missing": 1
    }
  ],

  "missing": [],

  "unparsed_lines": []
}
```

The middleware must perform deterministic quantity matching.

The GPT should not be expected to calculate collection coverage from raw collection records.

---

# 14. Decks Domain

```text
/api/decks
```

The decks domain handles deck-level reasoning and calculations.

Collection-aware deck endpoints may call collection services internally.

---

# 15. Deck Analysis

## `POST /api/decks/analyze`

Analyzes a submitted decklist.

Request:

```json
{
  "decklist": "1 Commander Name\n1 Card A\n1 Card B",
  "format": "commander",
  "include_collection": true
}
```

Potential response sections:

* Deck size
* Color identity
* Mana curve
* Land count
* Card-type distribution
* Interaction count
* Ramp count
* Card draw count
* Collection coverage
* Unresolved cards
* Legality issues

Scryfall or the existing card-detail API should resolve exact card information before analysis.

The analysis service should return structured facts.

The Custom GPT can then explain those facts to the user.

---

# 16. Deck Comparison

## `POST /api/decks/compare`

Compares two decklists.

Request:

```json
{
  "deck_a": "1 Card A\n1 Card B",
  "deck_b": "1 Card A\n1 Card C",
  "include_collection": true
}
```

Response:

```json
{
  "shared_cards": [],
  "only_in_deck_a": [],
  "only_in_deck_b": [],
  "mana_curve_difference": {},
  "type_distribution_difference": {},
  "collection_coverage": {
    "deck_a": 82.5,
    "deck_b": 76.3
  }
}
```

---

# 17. Deck Optimization

## `POST /api/decks/optimize`

Produces structured candidate changes.

Request:

```json
{
  "decklist": "1 Card A\n1 Card B",
  "format": "commander",
  "constraints": {
    "owned_only": true,
    "maximum_additions": 10,
    "preserve_theme": true
  }
}
```

The endpoint should return candidate additions and removals rather than claiming to identify a universally perfect deck.

Example:

```json
{
  "suggested_additions": [
    {
      "scryfall_id": "example-uuid",
      "name": "Example Card",
      "owned_quantity": 1,
      "reason_codes": [
        "mana_fixing",
        "curve_improvement"
      ]
    }
  ],

  "suggested_removals": [
    {
      "name": "Another Card",
      "reason_codes": [
        "high_mana_cost",
        "low_synergy"
      ]
    }
  ],

  "warnings": []
}
```

The GPT should provide the natural-language reasoning after receiving structured candidates.

---

# 18. Shared Decklist Parser

Create:

```text
lib/decks/decklist-parser.js
```

Supported lines:

```text
1 Card Name
1x Card Name
1 Card Name (SET)
1 Card Name (SET) 123
```

Supported sections:

```text
Commander
Mainboard
Sideboard
Maybeboard
Companion
```

Parser output:

```json
{
  "sections": {
    "commander": [],
    "mainboard": [],
    "sideboard": [],
    "maybeboard": []
  },
  "unparsed_lines": []
}
```

The parser should preserve:

* Quantity
* Submitted name
* Set code
* Collector number
* Section
* Original line number

---

# 19. Authentication Model

## 19.1 Read-only GPT actions

Operations:

```text
GET  /api/cards/search
GET  /api/cards/details
GET  /api/collection/search
GET  /api/collection/stats
POST /api/collection/check-deck
POST /api/decks/analyze
POST /api/decks/compare
POST /api/decks/optimize
```

Credential:

```text
GPT_ACTION_API_KEY
```

## 19.2 Collection import

Operation:

```text
POST /api/collection/import
```

Preferred credential:

```text
GPT_IMPORT_API_KEY
```

When separate operation credentials are not practical, use the normal GPT Action credential together with:

* `confirmed: true`
* Strict source validation
* Import rate limiting
* File hashing
* Transactional synchronization
* Complete import audit records

## 19.3 Supabase credentials

Vercel environment variables:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
GPT_ACTION_API_KEY
GPT_IMPORT_API_KEY
```

The Supabase Secret Key must:

* Exist only in Vercel server-side configuration.
* Never appear in `schema.yaml`.
* Never be returned by an endpoint.
* Never be sent to the Custom GPT.
* Never be logged.

---

# 20. Supabase Client

Create:

```text
lib/database/supabase-admin.js
```

```js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SECRET_KEY must be configured."
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);
```

Only repository modules should import `supabaseAdmin`.

API handlers and parsers should not access it directly.

---

# 21. Repository Layer

Create purpose-focused repository modules.

## `lib/collection/collection-repository.js`

Suggested operations:

```js
export async function createImport(metadata) {}

export async function findCompletedImportByHash(fileHash) {}

export async function syncCollectionSnapshot({
  importId,
  entries
}) {}

export async function markImportFailed({
  importId,
  error
}) {}

export async function searchCollection(filters) {}

export async function getCollectionStats() {}

export async function checkCardOwnership(cardIdentities) {}
```

## `lib/cards/card-repository.js`

Suggested operations:

```js
export async function searchCards(filters) {}

export async function getCardDetails(identifier) {}

export async function resolveCards(entries) {}
```

Deck services should depend on repositories or card services rather than call Scryfall directly.

---

# 22. GPT Action Schema

Update `schema.yaml` to expose the structured API.

Recommended operation IDs:

```text
searchCards
getCardDetails

importCollection
searchCollection
getCollectionStats
checkDeckAgainstCollection

analyzeDeck
compareDecks
optimizeDeck
```

## Import action description

The import operation description should clearly instruct the GPT:

```text
Imports and synchronizes a complete physical card collection from a
supported collection export. Use this operation only when the user
explicitly asks to import or synchronize an attached collection file.
The first supported source is ManaBox.
```

## Import request schema

```yaml
/api/collection/import:
  post:
    operationId: importCollection
    summary: Import a physical card collection
    description: >
      Imports and synchronizes a complete collection export. Invoke only
      after the user explicitly requests an import or synchronization.
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - source
              - csv
              - mode
              - confirmed
            properties:
              source:
                type: string
                enum:
                  - manabox
              filename:
                type: string
              csv:
                type: string
                description: Raw CSV content from the collection export.
              mode:
                type: string
                enum:
                  - synchronize
              confirmed:
                type: boolean
                const: true
    responses:
      "200":
        description: Import completed or unchanged
      "400":
        description: Invalid or unsupported collection export
      "401":
        description: Authentication failed
      "409":
        description: Import conflict
```

Keep responses concise enough for reliable GPT Action handling.

---

# 23. Custom GPT Instructions

Add collection-import guidance to the GPT’s instructions.

Suggested instruction:

```text
When the user provides a ManaBox CSV and explicitly asks to import or
synchronize it, call importCollection with source=manabox,
mode=synchronize, and confirmed=true.

Do not import a file merely because it was uploaded. Only call the import
action when the user clearly requests an import or synchronization.

After importing, report the number of source rows, normalized collection
entries, total copies, inserted entries, updated entries, archived entries,
and warnings.

If the import is rejected, explain the validation errors and do not claim
that the collection was updated.
```

The GPT should not expose:

* API credentials
* Supabase identifiers unrelated to the user
* Internal SQL errors
* Raw stack traces

---

# 24. Import Safety Controls

The GPT-enabled import route should include the following protections.

## Request limits

Recommended initial limits:

```text
Maximum request body: 5 MB
Maximum CSV rows: 25,000
Maximum normalized entries: 25,000
Maximum field length: 2,000 characters
```

These limits are far above the expected collection size while protecting the endpoint from accidental or malicious oversized requests.

## Source allowlist

Initially:

```text
manabox
```

Reject unknown sources.

## Import mode allowlist

Initially:

```text
synchronize
```

Do not implement append or destructive-delete modes in the first version.

## Confirmation requirement

Require:

```json
{
  "confirmed": true
}
```

## Duplicate import detection

Use SHA-256 hashing.

## Atomic synchronization

Use a PostgreSQL transaction or RPC function.

## Audit history

Keep every attempted import in `collection_imports`.

## Rate limit

A conservative initial limit is sufficient:

```text
5 import attempts per hour
```

Collection search and deck endpoints may have separate, higher limits.

---

# 25. Error Model

Use consistent structured errors.

Example:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_COLLECTION_EXPORT",
    "message": "The collection file could not be imported.",
    "details": [
      {
        "row": 18,
        "field": "quantity",
        "code": "INVALID_QUANTITY",
        "message": "Quantity must be a positive integer."
      }
    ]
  }
}
```

Suggested error codes:

```text
UNAUTHORIZED
FORBIDDEN
METHOD_NOT_ALLOWED
REQUEST_TOO_LARGE
UNSUPPORTED_IMPORT_SOURCE
INVALID_COLLECTION_EXPORT
MISSING_REQUIRED_HEADER
INVALID_QUANTITY
INVALID_SCRYFALL_ID
CARD_RESOLUTION_AMBIGUOUS
IMPORT_ALREADY_RUNNING
IMPORT_TRANSACTION_FAILED
CARD_NOT_FOUND
INVALID_DECKLIST
INTERNAL_ERROR
```

---

# 26. Migration from the Current Repository

## Phase 1: Introduce domain folders

Move or wrap current endpoints into:

```text
/api/cards
/api/collection
/api/decks
```

Do not change behavior yet.

Existing routes may temporarily delegate to new handlers.

Example:

```js
export { default } from "./cards/search.js";
```

This provides backward compatibility while clients migrate.

## Phase 2: Centralize shared infrastructure

Add:

```text
lib/database/supabase-admin.js
lib/http/
lib/auth/
```

Move duplicated:

* Authentication logic
* HTTP responses
* Method validation
* Error formatting
* Supabase initialization

## Phase 3: Refactor the existing ManaBox importer

Move the existing importer’s responsibilities into:

```text
api/collection/import.js

lib/collection/imports/import-service.js

lib/collection/manabox/parse-csv.js
lib/collection/manabox/map-headers.js
lib/collection/manabox/normalize-row.js
lib/collection/manabox/detect-format.js

lib/collection/collection-repository.js
```

Preserve the old endpoint temporarily if it already exists:

```text
POST /api/import-manabox
```

Make it delegate to the new service.

Target endpoint:

```text
POST /api/collection/import
```

## Phase 4: Add import history and snapshot synchronization

Apply database migrations.

Implement:

* File hashing
* Import status records
* Ownership keys
* Upserts
* Archiving
* Transactional RPC synchronization

## Phase 5: Enable GPT-triggered import

Add `importCollection` to `schema.yaml`.

Update GPT instructions.

Test:

1. CSV attached without import request.
2. CSV attached with explicit import request.
3. Same CSV imported twice.
4. Invalid CSV.
5. Partially malformed CSV.
6. Removed collection entries.
7. Changed quantities.
8. Reintroduced archived entries.

## Phase 6: Add collection read actions

Implement:

```text
GET /api/collection/search
GET /api/collection/stats
POST /api/collection/check-deck
```

Add them to `schema.yaml`.

## Phase 7: Add structured deck services

Implement:

```text
POST /api/decks/analyze
POST /api/decks/compare
POST /api/decks/optimize
```

Keep the first version deterministic and structured.

Let the GPT supply broader strategic explanations.

## Phase 8: Deprecate old routes

After the GPT and other clients use the new routes:

* Mark old routes as deprecated.
* Return deprecation headers.
* Document replacement routes.
* Remove old routes in a later major version.

---

# 27. Testing Plan

## 27.1 ManaBox parser tests

Test:

* UTF-8 BOM
* CRLF and LF line endings
* Quoted fields with commas
* Blank rows
* Missing required headers
* Alternate header capitalization
* Invalid column counts
* Empty files
* Excessively large files

## 27.2 Normalizer tests

Test:

* Quantities
* Scryfall UUIDs
* Set-code casing
* Collector-number suffixes
* Languages
* Conditions
* Blank locations
* Nonfoil
* Traditional foil
* Etched foil

## 27.3 Ownership-key tests

Confirm:

* Identical physical properties produce the same key.
* Different locations produce different keys.
* Different finishes produce different keys.
* Different conditions produce different keys.
* Fallback identifiers are deterministic.

## 27.4 Import service tests

Test:

1. First import.
2. Identical reimport.
3. Changed quantity.
4. New card.
5. Removed card.
6. Archived card reappears.
7. Invalid file.
8. Transaction failure.
9. Duplicate source rows.
10. Import initiated without confirmation.

## 27.5 Collection API tests

Test:

* Exact-name search
* Partial-name search
* Set filtering
* Location filtering
* Finish filtering
* Quantity totals
* Archived-entry exclusion
* Stats after multiple imports

## 27.6 Deck parser tests

Test:

```text
1 Card Name
1x Card Name
1 Card Name (SET)
1 Card Name (SET) 123
```

Also test:

* Commander
* Mainboard
* Sideboard
* Maybeboard
* Comments
* Empty lines
* Unresolved names
* Duplicate lines

## 27.7 GPT Action tests

Test conversational behavior:

### Import requested

```text
Import this attached ManaBox collection.
```

Expected:

* Import action called.
* `confirmed=true`.
* Summary reported.

### Analysis only

```text
Review this ManaBox CSV and tell me how many cards it contains.
```

Expected:

* Import action not called.

### Ambiguous request

```text
Here is my ManaBox collection.
```

Expected:

* Import action not called automatically.

### Duplicate import

Expected:

* GPT reports that the collection is already synchronized.

### Invalid import

Expected:

* GPT reports validation errors.
* GPT does not claim that collection data changed.

---

# 28. Deployment Plan

## Environment variables

Configure in Vercel:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
GPT_ACTION_API_KEY
GPT_IMPORT_API_KEY
```

Optional:

```text
SCRYFALL_USER_AGENT
IMPORT_MAX_BYTES
IMPORT_MAX_ROWS
IMPORT_RATE_LIMIT
```

## Deployment sequence

1. Apply Supabase migrations.
2. Deploy repository changes without exposing the import action.
3. Test import endpoint with a local request.
4. Test snapshot synchronization.
5. Deploy collection search and stats.
6. Update `schema.yaml`.
7. Add the revised schema to the Custom GPT.
8. Test read-only GPT Actions.
9. Enable the import operation.
10. Test with a sanitized ManaBox export.
11. Test with the real collection export.
12. Remove or deprecate obsolete routes.

---

# 29. Local Import Script

Create:

```text
scripts/import-manabox-local.js
```

Purpose:

* Test imports without the GPT.
* Diagnose CSV problems.
* Provide an emergency import method.
* Reproduce production import behavior.

Example usage:

```bash
node scripts/import-manabox-local.js ./collection.csv
```

The script should call the same `import-service.js` used by the API.

Do not duplicate import logic in the script.

---

# 30. README Updates

Add the following sections:

```text
Architecture
API domains
Environment variables
Supabase setup
Database migrations
ManaBox import
Custom GPT Actions
GPT import behavior
Collection search
Deck checking
Deck analysis
Authentication
Testing
Deployment
Troubleshooting
```

Include an architecture overview:

```text
/api/cards
/api/collection
/api/decks
```

Include a direct API test example:

```bash
curl \
  --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $GPT_IMPORT_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary @request.json \
  "https://your-domain.vercel.app/api/collection/import"
```

Example `request.json`:

```json
{
  "source": "manabox",
  "filename": "collection.csv",
  "csv": "Name,Set code,Collector number,Quantity\n...",
  "mode": "synchronize",
  "confirmed": true
}
```

---

# 31. MVP Scope

The initial release should include:

```text
/api/cards/search
/api/cards/details

/api/collection/import
/api/collection/search
/api/collection/stats
/api/collection/check-deck

/api/decks/analyze
```

The following may come later:

```text
/api/decks/compare
/api/decks/optimize
```

The first optimization endpoint should not attempt autonomous deck construction. It should provide structured candidate changes that the GPT can explain.

---

# 32. Recommended Implementation Order

```text
1. Create /api/cards, /api/collection and /api/decks domains.

2. Add shared auth, HTTP and Supabase modules.

3. Refactor the current ManaBox importer into:
   parser
   header mapper
   normalizer
   validator
   import service
   collection repository

4. Add collection_imports and owned_cards migrations.

5. Implement transactional snapshot synchronization.

6. Add file hashing and duplicate-import detection.

7. Add /api/collection/search.

8. Add /api/collection/stats.

9. Add /api/collection/check-deck.

10. Expose read-only operations through schema.yaml.

11. Expose /api/collection/import through schema.yaml.

12. Add GPT import instructions and confirmation requirements.

13. Add /api/decks/analyze.

14. Add compare and optimize after the core collection workflow is stable.

15. Deprecate legacy routes.
```

---

# 33. Definition of Done

The collection integration is complete when:

* The repository uses the `/cards`, `/collection` and `/decks` domain structure.
* The current ManaBox importer has been refactored into purpose-focused modules.
* The Custom GPT can import a user-provided ManaBox CSV.
* The GPT imports only after an explicit user request.
* Invalid imports cannot alter the active collection.
* Identical imports are detected and skipped.
* Collection changes preserve import history.
* Missing cards are archived rather than permanently deleted.
* Collection searches exclude archived entries.
* The GPT can search owned cards.
* The GPT can retrieve collection statistics.
* The GPT can compare a decklist against owned quantities.
* Supabase credentials never leave the Vercel backend.
* API handlers do not contain business logic.
* ManaBox-specific parsing remains isolated from generic collection services.
* Future import sources can reuse the same synchronization pipeline.
* Existing card APIs are organized under `/api/cards`.
* Deck analysis logic is organized under `/api/decks`.
* Automated tests cover parsing, normalization, synchronization and GPT Action behavior.

---

# 34. Final Target Structure

```text
/api
  /cards
    search
    details

  /collection
    import
    search
    stats
    check-deck

  /decks
    analyze
    compare
    optimize
```

Supporting implementation:

```text
/lib
  /auth
  /cards
  /collection
    /imports
    /manabox
  /decks
  /database
  /http
```

The result is a small, maintainable MTG middleware service in which:

* ManaBox handles scanning.
* Supabase stores physical ownership.
* Scryfall supplies canonical card information.
* Vercel exposes secure, structured APIs.
* The Custom GPT provides the user-facing intelligence and can safely initiate collection imports.
