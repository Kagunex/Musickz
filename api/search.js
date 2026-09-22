const innertube = require('../lib/innertube');
const { parseSearch } = require('../lib/parser');
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
  if (!q || q.length < 1) {
    return res.status(400).json(error('INVALID_QUERY', 'Query parameter "q" is required'));
  }
  if (q.length > 200) {
    return res.status(400).json(error('INVALID_QUERY', 'Query too long'));
  }

  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json(success(cached));
  }

  try {
    const raw = await innertube.search(q);
    const data = parseSearch(raw);
    cache.set(cacheKey, data, 3 * 60 * 1000);
    return res.status(200).json(success(data));
  } catch (err) {
    console.error('[search]', err.message);
    return res.status(502).json(
      error('API_ERROR', 'Failed to search music data', { reason: err.message })
    );
  }
};
