import { scrapeGoogle } from './googleScraper.js';
import { scrapeReddit } from './redditScraper.js';
import { scrapeX } from './xScraper.js';
import { upsertReviews } from '../db/qdrantClient.js';

// Budget allocation across sources
const SOURCE_BUDGET = { google: 0.40, reddit: 0.40, x: 0.20 };

/**
 * Main orchestrator — runs all scrapers, deduplicates, upserts to Qdrant.
 *
 * @param {object} options
 * @param {string} options.destination
 * @param {string|null} options.placeType
 * @param {number} options.maxRecords
 * @param {string[]} options.sources
 */
export async function runScraper({
  destination = 'Goa',
  placeType = null,
  maxRecords = 5000,
  sources = ['google', 'reddit', 'x'],
}) {
  console.log(`\n🚀 Scraper started | dest=${destination} | type=${placeType || 'all'} | max=${maxRecords}`);

  const budgets = Object.fromEntries(
    sources.map((s) => [s, Math.floor(maxRecords * (SOURCE_BUDGET[s] || 1 / sources.length))])
  );

  // Run scrapers concurrently
  const scraperMap = {
    google: () => scrapeGoogle(destination, placeType, budgets.google),
    reddit: () => scrapeReddit(destination, placeType, budgets.reddit),
    x: () => scrapeX(destination, placeType, budgets.x),
  };

  const tasks = sources
    .filter((s) => scraperMap[s])
    .map((s) =>
      scraperMap[s]().catch((err) => {
        console.error(`❌ Scraper '${s}' failed: ${err.message}`);
        return [];
      })
    );

  const results = await Promise.all(tasks);

  // Merge + deduplicate
  const seenIds = new Set();
  const allRecords = [];
  for (const batch of results) {
    for (const record of batch) {
      if (!seenIds.has(record.id)) {
        seenIds.add(record.id);
        allRecords.push(record);
      }
    }
  }

  const capped = allRecords.slice(0, maxRecords);
  console.log(`\n📦 Total unique records: ${capped.length} (cap: ${maxRecords})`);

  if (!capped.length) {
    console.warn('⚠️  No records scraped — check API keys and rate limits');
    return { total: 0, destination };
  }

  const total = await upsertReviews(capped, destination);

  // Summary
  const bySource = capped.reduce((acc, r) => {
    acc[r.metadata.source] = (acc[r.metadata.source] || 0) + 1;
    return acc;
  }, {});
  const byType = capped.reduce((acc, r) => {
    acc[r.metadata.type] = (acc[r.metadata.type] || 0) + 1;
    return acc;
  }, {});

  console.log(`\n✅ Done! Upserted ${total} vectors`);
  console.log(`📊 By source:`, bySource);
  console.log(`📊 By type:  `, byType);

  return { total, destination, bySource, byType };
}
