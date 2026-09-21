const innertube = require('../lib/innertube');
const { parsePlayer } = require('../lib/parser');
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
  if (!id || id.length < 5 || id.length > 20) {
    return res.status(400).json(error('INVALID_ID', 'Valid video ID is required'));
  }

  // Basic sanitization – only allow alphanumeric, -, _
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return res.status(400).json(error('INVALID_ID', 'Invalid video ID format'));
  }

  try {
    const raw = await innertube.player(id);
    const data = parsePlayer(raw);

    if (!data) {
      return res.status(502).json(
        error('PLAYBACK_UNAVAILABLE', 'Playback is currently unavailable')
      );
    }

    if (!data.available) {
      return res.status(403).json(
        error('PLAYBACK_UNAVAILABLE', data.reason || 'Playback is currently unavailable')
      );
    }

    // Prototype limitation: cipher streams need decipher (not fully implemented)
    if (data.hasCipher && !data.streamUrl) {
      return res.status(502).json(
        error(
          'PLAYBACK_UNAVAILABLE',
          'Stream requires signature deciphering which is limited in this web prototype. Use the Android native client for full playback.'
        )
      );
    }

    return res.status(200).json(success(data));
  } catch (err) {
    console.error('[player]', err.message);
    return res.status(502).json(
      error('PLAYBACK_UNAVAILABLE', 'Playback is currently unavailable', {
        reason: err.message,
      })
    );
  }
};
