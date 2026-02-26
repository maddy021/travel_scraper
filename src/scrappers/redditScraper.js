import Snoowrap from 'snoowrap';
import { config } from '../db/config.js';
import { md5 } from '../utils/helpers.js';

const SUBREDDITS = [
  'india', 'goa', 'travel', 'solotravel', 'backpacking',
  'IndiaTravel', 'digitalnomad', 'AskIndia',
];

const TYPE_KEYWORDS = {
  hotel: ['hotel', 'resort', 'hostel', 'stay', 'accommodation', 'airbnb', 'guesthouse'],
  restaurant: ['restaurant', 'food', 'eat', 'cafe', 'shack', 'seafood', 'dining'],
  place: ['beach', 'temple', 'fort', 'heritage', 'waterfall', 'place', 'visit', 'sightseeing'],
  activity: ['water sport', 'paragliding', 'scuba', 'nightlife', 'party', 'tour', 'activity', 'trek'],
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
export async function scrapeReddit(destination, placeType = null, maxRecords = 2000) {
  const reddit = new Snoowrap({
    userAgent: config.redditUserAgent,
    clientId: config.redditClientId,
    clientSecret: config.redditClientSecret,
    // Read-only — no username/password needed
    accessToken: undefined,
  });

  // snoowrap needs at least a username for app-only auth; use client_credentials
  reddit.config({ requestDelay: 500, continueAfterRatelimitError: true });

  const records = [];
  const seenIds = new Set();

  const baseQueries = placeType
    ? (TYPE_KEYWORDS[placeType] || [destination]).slice(0, 4).map((kw) => `${destination} ${kw}`)
    : [
      `${destination} review`,
      `${destination} hotel restaurant`,
      `${destination} travel tips`,
      `${destination} places to visit`,
      `${destination} trip report`,
    ];

  for (const subredditName of SUBREDDITS) {
    if (records.length >= maxRecords) break;
    const subreddit = reddit.getSubreddit(subredditName);

    for (const query of baseQueries.slice(0, 3)) {
      if (records.length >= maxRecords) break;
      console.log(`[Reddit] r/${subredditName} → "${query}"`);

      let submissions = [];
      try {
        submissions = await subreddit.search({ query, limit: 25, sort: 'relevance' });
      } catch (err) {
        console.error(`[Reddit] r/${subredditName} search error: ${err.message}`);
        continue;
      }

      for (const post of submissions) {
        if (records.length >= maxRecords) break;
        if (seenIds.has(post.id)) continue;
        seenIds.add(post.id);

        const fullText = `${post.title} ${post.selftext || ''}`;
        const ptype = placeType || classifyType(fullText);
        const postText = fullText.trim();

        if (postText.length > 50) {
          records.push({
            id: md5(`reddit_post_${post.id}`),
            text: postText.slice(0, 2000),
            metadata: {
              source: 'reddit',
              type: ptype,
              place_name: destination,
              subreddit: subredditName,
              score: post.score,
              url: `https://reddit.com${post.permalink}`,
              date: String(post.created_utc),
              author: post.author?.name || '',
            },
          });
        }

        // Top comments
        let comments = [];
        try {
          comments = await post.comments.fetchMore({ amount: 10, skipReplies: true });
        } catch {
          // ignore
        }

        for (const comment of comments.slice(0, 10)) {
          if (records.length >= maxRecords) break;
          const body = (comment.body || '').trim();
          if (body.length < 30 || body === '[deleted]' || body === '[removed]') continue;

          const uid = md5(`reddit_comment_${comment.id}`);
          if (seenIds.has(uid)) continue;
          seenIds.add(uid);

          records.push({
            id: uid,
            text: body.slice(0, 2000),
            metadata: {
              source: 'reddit',
              type: placeType || classifyType(body),
              place_name: destination,
              subreddit: subredditName,
              score: comment.score,
              url: `https://reddit.com${post.permalink}`,
              date: String(comment.created_utc),
              author: comment.author?.name || '',
            },
          });
        }
      }
    }
  }

  console.log(`[Reddit] Done — ${records.length} records`);
  return records.slice(0, maxRecords);
}
