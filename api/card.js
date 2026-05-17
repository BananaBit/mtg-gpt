export default {
  async fetch(request) {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (!name) {
      return Response.json({ error: "Missing card name" }, { status: 400 });
    }

    const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "mtg-beginner-rules-coach/1.0",
        "Accept": "application/json;q=0.9,*/*;q=0.8"
      }
    });

    const data = await response.json();
    return Response.json(data, { status: response.status });
  }
};
