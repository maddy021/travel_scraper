import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { config } from './config.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIM = 1536;

export const qdrant = new QdrantClient({
  url: config.qdrantUrl,
  ...(config.qdrantApiKey ? { apiKey: config.qdrantApiKey } : {}),
});

export const openai = new OpenAI({ apiKey: config.openaiApiKey });

/**
 * Ensure Qdrant collection exists with payload indexes for fast filtering.
 * We use ONE collection with `destination` as a payload field (acts like a namespace).
 */
export async function ensureCollection() {
  try {
    await qdrant.getCollection(config.qdrantCollectionName);
    console.log(`[Qdrant] Collection '${config.qdrantCollectionName}' exists ✓`);
  } catch {
    console.log(`[Qdrant] Creating collection '${config.qdrantCollectionName}'...`);
    await qdrant.createCollection(config.qdrantCollectionName, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
    });

    // Payload indexes for fast filtering
    for (const field of ['destination', 'type', 'source']) {
      await qdrant.createPayloadIndex(config.qdrantCollectionName, {
        field_name: field,
        field_schema: 'keyword',
      });
    }
    console.log('[Qdrant] Collection + indexes created ✓');
  }
}

/**
 * Generate embeddings in batches of 100.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts) {
  const all = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await openai.embeddings.create({ input: batch, model: EMBEDDING_MODEL });
    all.push(...res.data.map((d) => d.embedding));
  }
  return all;
}

/**
 * Upsert review records into Qdrant.
 * Each record: { id: string, text: string, metadata: object }
 * destination is stored as a payload field (acts as namespace).
 */
export async function upsertReviews(reviews, destination) {
  if (!reviews.length) return 0;
  await ensureCollection();

  const embeddings = await embedTexts(reviews.map((r) => r.text));

  const points = reviews.map((review, i) => ({
    id: hexToUint(review.id),
    vector: embeddings[i],
    payload: {
      ...review.metadata,
      text: review.text.slice(0, 1000),
      destination: destination.toLowerCase(),
      originalId: review.id,
    },
  }));

  let total = 0;
  for (let i = 0; i < points.length; i += 100) {
    await qdrant.upsert(config.qdrantCollectionName, {
      wait: true,
      points: points.slice(i, i + 100),
    });
    total += Math.min(100, points.length - i);
    console.log(`[Qdrant] Upserted ${total}/${points.length} for '${destination}'`);
  }
  return total;
}

/**
 * Semantic search with optional type filter.
 */
export async function queryReviews({ destination, query, placeType, topK = 10 }) {
  await ensureCollection();
  const [vector] = await embedTexts([query]);

  const mustFilters = [
    { key: 'destination', match: { value: destination.toLowerCase() } },
  ];
  if (placeType) {
    mustFilters.push({ key: 'type', match: { value: placeType } });
  }

  const results = await qdrant.search(config.qdrantCollectionName, {
    vector,
    limit: topK,
    filter: { must: mustFilters },
    with_payload: true,
  });

  return results.map((r) => ({
    score: r.score,
    id: r.payload.originalId,
    payload: r.payload,
  }));
}

/**
 * Collection stats, optionally with per-destination count.
 */
export async function getStats(destination) {
  await ensureCollection();
  const info = await qdrant.getCollection(config.qdrantCollectionName);

  const stats = {
    collectionName: config.qdrantCollectionName,
    totalVectors: info.vectors_count,
    indexedVectors: info.indexed_vectors_count,
    status: info.status,
  };

  if (destination) {
    const { count } = await qdrant.count(config.qdrantCollectionName, {
      filter: {
        must: [{ key: 'destination', match: { value: destination.toLowerCase() } }],
      },
      exact: true,
    });
    stats.destinationCount = count;
    stats.destination = destination.toLowerCase();
  }

  return stats;
}

/** Convert MD5 hex → safe JS integer for Qdrant point ID */
function hexToUint(hex) {
  return parseInt(hex.slice(0, 13), 16);
}
