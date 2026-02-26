import axios from 'axios';
import { config } from '../db/config.js';
import { md5, sleep } from '../utils/helpers.js';

const SEARCH_URL = 'https://api.twitter.com/2/tweets/search/recent';

const TYPE_KEYWORDS = {
  hotel: ['hotel', 'resort', 'hostel', 'stay', 'accommodation'],
  restaurant: ['restaurant', 'food', 'cafe', 'eat', 'seafood', 'shack'],
  place: ['beach', 'temple', 'fort', 'waterfall', 'sightseeing', 'visit'],
  activity: ['watersport', 'paragliding', 'scuba', 'nightlife', 'party', 'tour'],
};

function classifyType(text) {
  const lower = text.toLowerCase();
  let best = 'place';
  let bestScore = 0;
  for (const [ptype, kws] of Object.entries(TYPE_KEYWORDS)) {
    const score = kws.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = ptype; }
  }
  return best;
}

/**
 * @param {string} destination
 * @param {string|null} placeType
 * @param {number} maxRecords
 * @returns {Promise<Array>}
 */
export async function scrapeX(destination, placeType = null, maxRecords = 1000) {
  const records = [];
  const seenIds = new Set();

  const queries = placeType
    ? (TYPE_KEYWORDS[placeType] || []).slice(0, 3).map((kw) => `${destination} ${kw} -is:retweet lang:en`)
    : [
      `${destination} hotel review -is:retweet lang:en`,
      `${destination} restaurant food -is:retweet lang:en`,
      `${destination} travel tips -is:retweet lang:en`,
      `${destination} beach places -is:retweet lang:en`,
      `visiting ${destination} -is:retweet lang:en`,
    ];

  console.log("bearer token", config.xBearerToken);

  const headers = { Authorization: `Bearer ${config.xBearerToken}` };

  for (const query of queries) {
    if (records.length >= maxRecords) break;
    console.log(`[X] Searching: "${query}"`);

    try {
      const { data } = await axios.get(SEARCH_URL, {
        headers,
        params: {
          query,
          max_results: 100,
          'tweet.fields': 'created_at,author_id,public_metrics,text',
          expansions: 'author_id',
          'user.fields': 'username',
        },
      });

      const tweets = data.data || [];
      const users = Object.fromEntries(
        (data.includes?.users || []).map((u) => [u.id, u.username])
      );

      for (const tweet of tweets) {
        if (records.length >= maxRecords) break;
        if (seenIds.has(tweet.id)) continue;
        seenIds.add(tweet.id);

        const text = (tweet.text || '').trim();
        if (text.length < 30) continue;

        const metrics = tweet.public_metrics || {};
        records.push({
          id: md5(`x_${tweet.id}`),
          text,
          metadata: {
            source: 'x',
            type: placeType || classifyType(text),
            place_name: destination,
            tweet_id: tweet.id,
            author: users[tweet.author_id] || '',
            date: tweet.created_at || '',
            url: `https://x.com/i/web/status/${tweet.id}`,
            likes: metrics.like_count || 0,
            retweets: metrics.retweet_count || 0,
          },
        });
      }

      await sleep(1000); // X rate limits are strict
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn('[X] Rate limited — stopping X scraper');
        break;
      }
      console.error(`[X] Error for query "${query}": ${err.message}`);
    }
  }

  console.log(`[X] Done — ${records.length} records`);
  return records.slice(0, maxRecords);
}
