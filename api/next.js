const innertube = require('../lib/innertube');
const { parseNext } = require('../lib/parser');
const { success, error } = require('../lib/normalizer');

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
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json(error('INVALID_ID', 'Valid video ID is required'));
  }

  try {
    const raw = await innertube.next(id);
    const data = parseNext(raw);
    return res.status(200).json(success(data));
  } catch (err) {
    console.error('[next]', err.message);
    return res.status(502).json(
      error('API_ERROR', 'Failed to load next/queue data', { reason: err.message })
    );
  }
};
