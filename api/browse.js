const innertube = require('../lib/innertube');
const { parseBrowse } = require('../lib/parser');
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

  const id = (req.query.id || '').trim();
  if (!id) {
    return res.status(400).json(error('INVALID_ID', 'Parameter "id" (browseId) is required'));
  }
  if (id.length > 100) {
    return res.status(400).json(error('INVALID_ID', 'Browse ID too long'));
  }

  const cacheKey = `browse:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json(success(cached));
  }

  try {
    const raw = await innertube.browse(id);
    const data = parseBrowse(raw);
    cache.set(cacheKey, data, 5 * 60 * 1000);
    return res.status(200).json(success(data));
  } catch (err) {
    console.error('[browse]', err.message);
    return res.status(502).json(
      error('API_ERROR', 'Failed to load browse data', { reason: err.message })
    );
  }
};
