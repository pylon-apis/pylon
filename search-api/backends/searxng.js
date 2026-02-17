const SEARXNG_URL = process.env.SEARXNG_URL || "http://pylon-searxng.internal:8080";

async function search(query, count = 10, category = "general") {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    categories: category,
    pageno: "1",
  });

  const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`SearXNG returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();

  const results = (data.results || []).slice(0, count).map((r) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.content || "",
    source: r.engine || r.engines?.[0] || "unknown",
  }));

  return { query, results, count: results.length, category };
}

module.exports = { search };
