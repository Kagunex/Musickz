const innertube = require('../lib/innertube');
const { parseSuggestions } = require('../lib/parser');
const { success, error } = require('../lib/normalizer');
const cache = require('../lib/cache');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json(error('METHOD_NOT_ALLOWED', 'Only GET is supported'));
  }

  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(200).json(success([]));
  }
  if (q.length > 100) {
    return res.status(400).json(error('INVALID_QUERY', 'Query too long'));
  }

  const cacheKey = `sug:${q.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json(success(cached));
  }

  try {
    const raw = await innertube.getSearchSuggestions(q);
    const data = parseSuggestions(raw);
    cache.set(cacheKey, data, 2 * 60 * 1000);
    return res.status(200).json(success(data));
  } catch (err) {
    console.error('[suggestions]', err.message);
    // Suggestions are non-critical – return empty rather than error
    return res.status(200).json(success([]));
  }
};
