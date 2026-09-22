/**
 * Lightweight in-memory cache for metadata (Vercel serverless friendly).
 * TTL in milliseconds.
 */

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs = 5 * 60 * 1000) {
  store.set(key, {
    value,
    expires: Date.now() + ttlMs,
  });
}

function clear() {
  store.clear();
}

module.exports = { get, set, clear };
