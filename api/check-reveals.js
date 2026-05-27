import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SCRYFALL_HEADERS = {
  "User-Agent": "mtg-beginner-rules-coach/1.0",
  Accept: "application/json;q=0.9,*/*;q=0.8",
};

async function fetchAllCards(set = "msh") {
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
    `set:${set}`
  )}&unique=prints&order=set`;

  const cards = [];

  while (url) {
    const response = await fetch(url, { headers: SCRYFALL_HEADERS });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || "Scryfall search failed");
    }

    cards.push(...data.data);
    url = data.has_more ? data.next_page : null;
  }

  return cards;
}

function getCardImage(card) {
  return (
    card.image_uris?.large ||
    card.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.large ||
    card.card_faces?.[0]?.image_uris?.normal ||
    null
  );
}

function chunk(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

async function sendDiscordDigest(cards, set) {
  const groups = chunk(cards, 10);

  for (const group of groups) {
    const embeds = group.map((card) => ({
      title: card.name,
      url: card.scryfall_uri,
      description: [
        card.mana_cost || "",
        card.type_line || "",
        card.oracle_text ? `\n${card.oracle_text.slice(0, 500)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      color: 15158332,
      image: {
        url: getCardImage(card),
      },
      footer: {
        text: `Set: ${set.toUpperCase()} • Collector #${card.collector_number}`,
      },
    }));

    const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `🦸 ${group.length} new Marvel reveal(s)!`,
        embeds,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord webhook failed: ${text}`);
    }
  }
}

export default async function handler(req, res) {
  try {
    if (req.query.secret !== process.env.CRON_SECRET) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const set = req.query.set || "msh";
    const redisKey = `revealed:${set}:ids`;

    const cards = await fetchAllCards(set);
    const currentIds = cards.map((card) => card.id);

    const savedIds = (await redis.smembers(redisKey)) || [];
    const saved = new Set(savedIds);

    const newCards = cards.filter((card) => !saved.has(card.id));
    const isFirstRun = savedIds.length === 0;

    if (!isFirstRun && newCards.length > 0) {
      await sendDiscordDigest(newCards, set);
    }

    await redis.del(redisKey);

    if (currentIds.length > 0) {
      await redis.sadd(redisKey, ...currentIds);
    }

    return res.status(200).json({
      success: true,
      set,
      total_cards: cards.length,
      new_cards: newCards.map((card) => ({
        name: card.name,
        collector_number: card.collector_number,
        scryfall: card.scryfall_uri,
        image: getCardImage(card),
      })),
      first_run: isFirstRun,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
