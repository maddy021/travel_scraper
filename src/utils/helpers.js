import { createHash } from 'crypto'; // Node built-in, no install needed

// Generates an MD5 hex string from any input string
// Used to create deterministic unique IDs for each review
export function md5(str) {
    return createHash('md5').update(str).digest('hex');
}

// Converts a string to a URL-safe slug e.g. "South Goa" → "south_goa"
export function slugify(str) {
    return str.toLowerCase().replace(/\s+/g, '_');
}

// Promise-based delay — used to avoid hammering APIs
// e.g. await sleep(200) waits 200ms
export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}