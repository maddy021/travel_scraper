import express from 'express';
import { config } from './db/config.js';
import routes from './routes/index.js';

const app = express();

app.use(express.json());

// Routes
app.use('/', routes);

// Root
app.get('/', (_req, res) => {
  res.json({
    name: 'Places Review Scraper API',
    version: '1.0.0',
    endpoints: {
      'POST /scrape': 'Start scraping reviews for a destination',
      'POST /query': 'Semantic search over stored reviews',
      'GET  /stats': 'Qdrant collection stats (add ?destination=Goa for per-dest count)',
      'GET  /health': 'Health check',
    },
    example: {
      scrape: { destination: 'Goa', maxRecords: 5000, sources: ['google', 'reddit', 'x'] },
      query: { destination: 'Goa', query: 'best beachfront hotel with pool', placeType: 'hotel', topK: 5 },
    },
  });
});

app.listen(config.port, () => {
  console.log(`\n🚀 Places Review Scraper API running on http://localhost:${config.port}`);
  console.log(`   Qdrant: ${config.qdrantUrl}`);
  console.log(`   Collection: ${config.qdrantCollectionName}\n`);
});
