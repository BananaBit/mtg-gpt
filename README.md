# MTG Scryfall Proxy for ChatGPT Actions

A lightweight Vercel proxy for the [Scryfall API](https://scryfall.com/docs/api), designed for ChatGPT Custom GPT Actions and MTG assistant workflows.

The proxy adds the HTTP headers Scryfall expects, which helps avoid `403 Forbidden` issues when calling Scryfall directly from a GPT Action.

---

## Features

- Look up a Magic card by name.
- Fetch a card image by name.
- Fetch a compact card list for an entire set for GPT reasoning.
- Track newly revealed cards from a set and send Discord reveal digests.
- Deploy as serverless API routes on Vercel.
- Optional Redis-backed reveal tracking through Upstash.

---

## Project structure

```text
mtg-gpt/
├── api/
│   ├── card.js
│   ├── card-image.js
│   ├── check-reveals.js
│   └── set-cards.js
├── package.json
├── vercel.json
└── README.md
```

> `set-cards.js` is the recommended new endpoint for whole-set reasoning in GPT Actions. Add it before using the `/api/set-cards` route.

---

## API routes

### `GET /api/card`

Looks up a card by fuzzy name using Scryfall and returns a simplified JSON response.

#### Query parameters

| Parameter | Required | Example | Description |
| --- | --- | --- | --- |
| `name` | Yes | `Lightning Bolt` | Card name to search with Scryfall fuzzy matching. |

#### Example request

```text
/api/card?name=Lightning%20Bolt
```

#### Example response shape

```json
{
  "name": "Lightning Bolt",
  "mana_cost": "{R}",
  "type_line": "Instant",
  "oracle_text": "Lightning Bolt deals 3 damage to any target.",
  "power": null,
  "toughness": null,
  "loyalty": null,
  "keywords": [],
  "legalities": {},
  "image": "https://...",
  "art_crop": "https://...",
  "rulings": "https://...",
  "scryfall": "https://..."
}
```

---

### `GET /api/card-image`

Looks up a card by fuzzy name and returns the normal card image as binary image data.

#### Query parameters

| Parameter | Required | Example | Description |
| --- | --- | --- | --- |
| `name` | Yes | `Lightning Bolt` | Card name to search with Scryfall fuzzy matching. |

#### Example request

```text
/api/card-image?name=Lightning%20Bolt
```

#### Response

Returns image bytes with a `Content-Type` from Scryfall, usually `image/jpeg`.

---

### `GET /api/set-cards`

Returns a compact, GPT-friendly list of cards from an entire Scryfall set.

This route is intended for reasoning-heavy tasks such as:

- prerelease deckbuilding;
- comparing color strength;
- evaluating commons and uncommons;
- finding synergies and archetypes;
- identifying bombs, removal, fixing, and curve support.

The response intentionally avoids large fields such as images, prices, purchase links, legalities, artist data, related URIs, and full Scryfall metadata.

#### Query parameters

| Parameter | Required | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `set` | Yes | — | `msh` | Scryfall set code. |
| `code` | No | — | `msh` | Alias for `set`. |
| `includeExtras` | No | `false` | `true` | Include extras such as tokens or special objects. |
| `includeVariations` | No | `false` | `true` | Include variant printings. |

#### Example request

```text
/api/set-cards?set=msh
```

#### Example request including extras and variations

```text
/api/set-cards?set=msh&includeExtras=true&includeVariations=true
```

#### Example response shape

```json
{
  "set": "msh",
  "name": "Marvel Super Heroes",
  "count": 302,
  "cards": [
    {
      "name": "Example Hero",
      "cost": "{2}{W}",
      "mv": 3,
      "colors": ["W"],
      "rarity": "uncommon",
      "type": "Creature — Human Hero",
      "text": "Flying. When this creature enters, tap target creature.",
      "pt": "2/3",
      "keywords": ["Flying"],
      "number": "12"
    }
  ]
}
```

#### Compact card fields

| Field | Description |
| --- | --- |
| `name` | Card name. |
| `cost` | Mana cost. |
| `mv` | Mana value. |
| `colors` | Card colors. |
| `color_identity` | Included only when it adds information beyond `colors`. |
| `rarity` | Card rarity. |
| `type` | Type line. |
| `text` | Oracle text, including face text for double-faced or modal cards. |
| `pt` | Power/toughness when present. |
| `loyalty` | Planeswalker loyalty when present. |
| `defense` | Battle defense when present. |
| `keywords` | Scryfall keyword array. |
| `number` | Collector number. |

---

### `GET /api/check-reveals`

Protected endpoint used by Vercel Cron to check a Scryfall set for newly revealed cards and send a Discord digest.

This is not intended as a public GPT Action route. It requires an authorization header and environment variables.

#### Query parameters

| Parameter | Required | Default | Example | Description |
| --- | --- | --- | --- | --- |
| `set` | No | `msh` | `msh` | Scryfall set code to check. |

#### Required header

```text
Authorization: Bearer <CRON_SECRET>
```

#### Example request

```text
/api/check-reveals?set=msh
```

#### Example response shape

```json
{
  "success": true,
  "set": "msh",
  "total_cards": 302,
  "new_cards": [
    {
      "name": "Example Hero",
      "collector_number": "12",
      "scryfall": "https://...",
      "image": "https://..."
    }
  ],
  "first_run": false
}
```

---

## Environment variables

The basic card lookup and set-card endpoints do not require environment variables.

The reveal-checking endpoint requires:

| Variable | Required for | Description |
| --- | --- | --- |
| `CRON_SECRET` | `/api/check-reveals` | Secret token used in the `Authorization` header. |
| `DISCORD_WEBHOOK_URL` | `/api/check-reveals` | Discord webhook where reveal digests are posted. |
| `UPSTASH_REDIS_REST_URL` | `/api/check-reveals` | Upstash Redis REST URL. |
| `UPSTASH_REDIS_REST_TOKEN` | `/api/check-reveals` | Upstash Redis REST token. |

---

## Vercel Cron

The current cron configuration checks the Marvel set once per day:

```json
{
  "crons": [
    {
      "path": "/api/check-reveals?set=msh",
      "schedule": "0 12 * * *"
    }
  ]
}
```

The schedule above runs daily at 12:00 UTC.

---

## Local development

Install dependencies:

```bash
npm install
```

Run locally with Vercel:

```bash
vercel dev
```

Example local requests:

```text
http://localhost:3000/api/card?name=Lightning%20Bolt
http://localhost:3000/api/card-image?name=Lightning%20Bolt
http://localhost:3000/api/set-cards?set=msh
```

---

## Deploy to Vercel

Install the Vercel CLI if needed:

```bash
npm install -g vercel
```

Log in:

```bash
vercel login
```

Deploy a preview:

```bash
vercel
```

Deploy to production:

```bash
vercel --prod
```

---

## Using with ChatGPT Custom GPT Actions

In your Custom GPT:

1. Open **Configure**.
2. Go to **Actions**.
3. Create or edit an action.
4. Paste your OpenAPI schema.
5. Set the server URL to your Vercel domain.

Example:

```yaml
servers:
  - url: https://your-project.vercel.app
```

Recommended GPT Action routes:

```text
GET /api/card
GET /api/card-image
GET /api/set-cards
```

Avoid exposing `/api/check-reveals` as a GPT Action because it is a protected cron/automation endpoint.

---

## Suggested OpenAPI path for `/api/set-cards`

```yaml
/api/set-cards:
  get:
    operationId: getScryfallSetCards
    summary: Get a compact card list for an entire Scryfall set
    description: Returns a compact, GPT-friendly list of cards from a Scryfall set for deckbuilding and set analysis.
    parameters:
      - name: set
        in: query
        required: true
        schema:
          type: string
        description: Scryfall set code, for example msh.
      - name: includeExtras
        in: query
        required: false
        schema:
          type: boolean
          default: false
        description: Whether to include extras such as tokens or special objects.
      - name: includeVariations
        in: query
        required: false
        schema:
          type: boolean
          default: false
        description: Whether to include variant printings.
    responses:
      "200":
        description: Compact set card list.
      "400":
        description: Missing or invalid set code.
      "500":
        description: Internal proxy error.
```

---

## Notes

Scryfall expects API clients to send:

- HTTPS requests;
- a descriptive `User-Agent`;
- an appropriate `Accept` header.

This proxy handles those headers automatically.

For whole-set GPT reasoning, prefer `/api/set-cards` over raw Scryfall responses because the compact response saves context and focuses on card evaluation fields.

---

## Useful links

- [Scryfall API Docs](https://scryfall.com/docs/api)
- [Scryfall Sets API](https://scryfall.com/docs/api/sets)
- [Scryfall Card Search API](https://scryfall.com/docs/api/cards/search)
- [OpenAI Actions Docs](https://platform.openai.com/docs/actions)
- [Vercel Functions Docs](https://vercel.com/docs/functions)
