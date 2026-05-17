# MTG Scryfall Proxy for ChatGPT Actions

A lightweight proxy for the [Scryfall API](https://scryfall.com/docs/api?utm_source=chatgpt.com) designed for ChatGPT Custom GPT Actions.

This proxy adds the required HTTP headers that Scryfall expects, avoiding common `403 Forbidden` issues when calling the API directly from GPT Actions.

---

# Features

* Card lookup by name
* Beginner-friendly setup
* Serverless deployment on [Vercel](https://vercel.com?utm_source=chatgpt.com)
* No database required
* Free to host

---

# Project Structure

```text
mtg-scryfall-proxy/
├── api/
│   └── card.js
├── package.json
└── README.md
```

---

# Setup

## 1. Create the project

```bash
mkdir mtg-scryfall-proxy
cd mtg-scryfall-proxy
```

## 2. Create package.json

```json
{
  "name": "mtg-scryfall-proxy",
  "version": "1.0.0",
  "type": "module"
}
```

## 3. Create api/card.js

```js
export default async function handler(req, res) {
  const { name } = req.query;

  if (!name) {
    return res.status(400).json({
      error: "Missing card name"
    });
  }

  const url =
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "mtg-beginner-rules-coach/1.0",
        "Accept": "application/json;q=0.9,*/*;q=0.8"
      }
    });

    const data = await response.json();

    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({
      error: "Internal proxy error",
      details: error.message
    });
  }
}
```

---

# Deploy to Vercel

## 1. Install Vercel CLI

```bash
npm install -g vercel
```

## 2. Login

```bash
vercel login
```

## 3. Deploy

```bash
vercel
```

## 4. Deploy to production

```bash
vercel --prod
```

---

# Example Endpoint

```text
https://your-project.vercel.app/api/card?name=Lightning%20Bolt
```

---

# Example Response

```json
{
  "name": "Lightning Bolt",
  "mana_cost": "{R}",
  "type_line": "Instant",
  "oracle_text": "Lightning Bolt deals 3 damage to any target."
}
```

---

# Using with ChatGPT Custom GPT Actions

In your Custom GPT:

1. Open **Configure**
2. Go to **Actions**
3. Create a new action
4. Paste your OpenAPI schema
5. Set the server URL to your Vercel domain

Example:

```yaml
servers:
  - url: https://your-project.vercel.app
```

---

# Notes

Scryfall recommends:

* HTTPS requests
* Custom `User-Agent`
* Proper `Accept` header

This proxy handles those requirements automatically.

---

# Recommended Future Improvements

* Add card rulings endpoint
* Add image URLs
* Add search support
* Add Commander legality helper
* Add caching
* Add rate limiting

---

# Useful Links

* [Scryfall API Docs](https://scryfall.com/docs/api?utm_source=chatgpt.com)
* [OpenAI Actions Docs](https://platform.openai.com/docs/actions?utm_source=chatgpt.com)
* [Vercel Functions Docs](https://vercel.com/docs/functions?utm_source=chatgpt.com)
