import axios from 'axios';
import { config } from '../db/config.js';
import { md5, sleep } from '../utils/helpers.js';

const BASE = 'https://maps.googleapis.com/maps/api/place';

const TYPE_QUERIES = {
  hotel: [
    '{dest} best hotels',
    '{dest} luxury resorts',
    '{dest} budget hotels',
    '{dest} beach resorts',
  ],
  restaurant: [
    '{dest} best restaurants',
    '{dest} seafood restaurants',
    '{dest} cafes',
    '{dest} rooftop restaurants',
  ],
  place: [
    '{dest} tourist places',
    '{dest} beaches',
    '{dest} temples forts',
    '{dest} waterfalls',
  ],
  activity: [
    '{dest} water sports',
    '{dest} things to do',
    '{dest} nightlife',
    '{dest} tours adventure',
  ],
};

async function textSearch(query) {
  const { data } = await axios.get(`${BASE}/textsearch/json`, {
    params: { query, key: config.googlePlacesApiKey },
  });
  return data.results || [];
}

async function placeDetails(placeId) {
  const { data } = await axios.get(`${BASE}/details/json`, {
    params: {
      place_id: placeId,
      fields: 'name,rating,reviews,formatted_address,url,types',
      key: config.googlePlacesApiKey,
    },
  });
  return data.result || {};
}

/**
 * @param {string} destination
 * @param {string|null} placeType
 * @param {number} maxRecords
 * @returns {Promise<Array>}
 */
export async function scrapeGoogle(destination, placeType = null, maxRecords = 2000) {
  const records = [];
  const seenPlaceIds = new Set();
  const typesToScrape = placeType ? [placeType] : Object.keys(TYPE_QUERIES);

  for (const ptype of typesToScrape) {
    if (records.length >= maxRecords) break;

    const queries = (TYPE_QUERIES[ptype] || []).map((q) =>
      q.replace('{dest}', destination)
    );

    for (const query of queries) {
      if (records.length >= maxRecords) break;
      console.log(`[Google] Searching: "${query}"`);

      let places = [];
      try {
        places = await textSearch(query);
        await sleep(200); // be kind to the API
      } catch (err) {
        console.error(`[Google] Search failed: ${err.message}`);
        continue;
      }

      for (const place of places) {
        if (records.length >= maxRecords) break;
        const { place_id, name } = place;
        if (!place_id || seenPlaceIds.has(place_id)) continue;
        seenPlaceIds.add(place_id);

        console.log(`[Google] Getting reviews: ${name}`);
        let details = {};
        try {
          details = await placeDetails(place_id);
          await sleep(200);
        } catch (err) {
          console.error(`[Google] Details failed for ${name}: ${err.message}`);
          continue;
        }

        const reviews = (details.reviews || []).slice(0, config.googleMaxPerPlace);
        for (const review of reviews) {
          const text = (review.text || '').trim();
          if (!text || text.length < 20) continue;

          const id = md5(`google_${place_id}_${review.time}`);
          records.push({
            id,
            text: `${name}: ${text}`,
            metadata: {
              source: 'google',
              type: ptype,
              place_name: name,
              place_id,
              rating: review.rating ?? null,
              author: review.author_name || '',
              date: String(review.time || ''),
              url: details.url || '',
              address: details.formatted_address || '',
            },
          });
        }
      }
    }
  }

  console.log(`[Google] Done — ${records.length} records`);
  return records.slice(0, maxRecords);
}
