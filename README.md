# 🗺️ Places Review Scraper API (Node.js + Qdrant)

Scrapes reviews for travel destinations from **Google Places**, **Reddit**, and **X (Twitter)** and stores them in **Qdrant** for semantic search.

Built for destination-based review intelligence — starting with **Goa**.

---

## Stack

| Layer | Tech |
|-------|------|
| API Server | Express.js (Node 18+) |
| Vector DB | Qdrant (local Docker or Qdrant Cloud) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Reddit | snoowrap (PRAW equivalent for Node) |
| Google | Google Places API (REST via axios) |
| X/Twitter | Twitter API v2 (Bearer Token via axios) |
| Validation | Zod |

---

## Qdrant Schema

All records go into **one collection** (`places_reviews`) with **`destination` as a payload field** — functioning like a namespace.

| Field | Type | Description |
|-------|------|-------------|
| `destination` | keyword | Destination slug e.g. `goa` |
| `type` | keyword | `place` \| `hotel` \| `restaurant` \| `activity` |
| `source` | keyword | `google` \| `reddit` \| `x` |
| `place_name` | string | Name of the hotel/restaurant/place |
| `text` | string | Review snippet (first 1000 chars) |
| `rating` | number | Star rating (Google only) |
| `url` | string | Link to original review |
| `date` | string | UTC timestamp |
| `author` | string | Review author |

All three keyword fields have **payload indexes** for fast filtered search.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Run Qdrant locally (Docker)

```bash
docker run -p 6333:6333 qdrant/qdrant
```

Or use [Qdrant Cloud](https://cloud.qdrant.io) (free tier: 1 cluster, 1GB).

### 3. Configure

```bash
cp .env.example .env
# Fill in all keys
```

**API Keys needed:**

| Service | Where |
|---------|-------|
| OpenAI | [platform.openai.com](https://platform.openai.com) |
| Qdrant Cloud (optional) | [cloud.qdrant.io](https://cloud.qdrant.io) |
| Reddit | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → create "script" app |
| Google Places | Google Cloud Console → enable "Places API" |
| X/Twitter | [developer.twitter.com](https://developer.twitter.com) |

### 4. Run

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

---

## API Reference

### `POST /scrape`

Kicks off scraping in the background.

```json
{
  "destination": "Goa",
  "placeType": "hotel",        // optional: place | hotel | restaurant | activity
  "maxRecords": 5000,
  "sources": ["google", "reddit", "x"]
}
```

```bash
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"destination": "Goa", "maxRecords": 5000}'
```

---

### `POST /query`

Semantic search over stored reviews.

```json
{
  "destination": "Goa",
  "query": "beachfront hotel with pool and good food",
  "placeType": "hotel",   // optional filter
  "topK": 5
}
```

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"destination": "Goa", "query": "best seafood shack", "placeType": "restaurant", "topK": 5}'
```

---

### `GET /stats`

```bash
# All stats
curl http://localhost:3000/stats

# Per-destination count
curl "http://localhost:3000/stats?destination=Goa"
```

---

## Adding New Destinations

Just change the `destination` field:

```json
{ "destination": "Manali", "maxRecords": 5000 }
```

Records are stored with `destination: "manali"` in payload — fully queryable independently.

---

## Budget & Cost (5000 records, Goa)

| Service | Est. Cost |
|---------|-----------|
| OpenAI embeddings (5k × ~200 tokens) | ~$0.002 |
| Google Places (~200 detail calls) | ~$3.40 |
| Qdrant local / free cloud tier | $0 |
| Reddit | $0 |
| X free tier | $0 |
| **Total** | **~$3.50** |

---

## Project Structure

```
src/
├── index.js                  # Express app entry
├── config.js                 # Env config
├── routes/
│   └── index.js              # All API routes
├── scrapers/
│   ├── orchestrator.js       # Coordinates scrapers + dedup + cap
│   ├── googleScraper.js      # Google Places API
│   ├── redditScraper.js      # Reddit via snoowrap
│   └── xScraper.js           # X/Twitter API v2
├── db/
│   └── qdrantClient.js       # Qdrant + OpenAI embeddings
└── utils/
    └── helpers.js            # md5, slugify, sleep
```
