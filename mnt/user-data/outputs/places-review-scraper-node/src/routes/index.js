import { Router } from 'express';
import { z } from 'zod';
import { runScraper } from '../scrapers/orchestrator.js';
import { queryReviews, getStats } from '../db/qdrantClient.js';

const router = Router();

const PlaceType = z.enum(['place', 'hotel', 'restaurant', 'activity']);

// ─── POST /scrape ────────────────────────────────────────────────────────────
const ScrapeSchema = z.object({
  destination: z.string().min(1).default('Goa'),
  placeType: PlaceType.nullable().optional(),
  maxRecords: z.number().int().min(1).max(5000).default(5000),
  sources: z.array(z.enum(['google', 'reddit', 'x'])).default(['google', 'reddit', 'x']),
});

router.post('/scrape', (req, res) => {
  const parsed = ScrapeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { destination, placeType, maxRecords, sources } = parsed.data;

  // Fire and forget — runs in background
  runScraper({ destination, placeType, maxRecords, sources }).catch((err) =>
    console.error('[Scrape background error]', err)
  );

  return res.json({
    status: 'started',
    message: `Scraping '${destination}' in the background. Check /stats to monitor progress.`,
    config: parsed.data,
  });
});

// ─── POST /query ─────────────────────────────────────────────────────────────
const QuerySchema = z.object({
  destination: z.string().min(1).default('Goa'),
  query: z.string().min(1),
  placeType: PlaceType.nullable().optional(),
  topK: z.number().int().min(1).max(50).default(10),
});

router.post('/query', async (req, res) => {
  const parsed = QuerySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const results = await queryReviews(parsed.data);
    return res.json({ results, count: results.length });
  } catch (err) {
    console.error('[Query error]', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats(req.query.destination || null);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /health ─────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

export default router;
