import 'dotenv/config';

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: process.env.PORT || 3000,

  // Qdrant
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY || '',
  qdrantCollectionName: process.env.QDRANT_COLLECTION || 'places_reviews',

  // OpenAI (embeddings)
  openaiApiKey: required('OPENAI_API_KEY'),

  // Reddit
  redditClientId: required('REDDIT_CLIENT_ID'),
  redditClientSecret: required('REDDIT_CLIENT_SECRET'),
  redditUserAgent: process.env.REDDIT_USER_AGENT || 'PlacesReviewScraper/1.0',

  // Google Places
  googlePlacesApiKey: required('GOOGLE_PLACES_API_KEY'),

  // X / Twitter v2
  xBearerToken: required('X_BEARER_TOKEN'),

  // Limits
  maxRecordsTotal: parseInt(process.env.MAX_RECORDS_TOTAL || '5000'),
  googleMaxPerPlace: parseInt(process.env.GOOGLE_MAX_PER_PLACE || '50'),
};
