const innertube = require('../lib/innertube');
const { parsePlayer } = require('../lib/parser');
const { success, error } = require('../lib/normalizer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Playback stream URLs expire; do not cache aggressively
  res.setHeader('Cache-Control', 'no-store, max-age=0');

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
    console.log(`[player] videoId=${id} request`);
    const raw = await innertube.player(id);
    const data = parsePlayer(raw);

    if (!data) {
      return res.status(502).json(
        error('PLAYBACK_UNAVAILABLE', 'Playback is currently unavailable')
      );
    }

    if (!data.available) {
      const code = data.errorCode || 'PLAYBACK_UNAVAILABLE';
      const message =
        data.reason ||
        (code === 'LOGIN_REQUIRED'
          ? 'Playback requires sign-in for this track.'
          : code === 'NO_AUDIO_STREAM'
            ? 'No playable audio stream is available.'
            : code === 'STREAM_REQUIRES_ADDITIONAL_PROCESSING'
              ? 'This track cannot be played by the current web player.'
              : 'Playback is currently unavailable');

      const status =
        code === 'LOGIN_REQUIRED' ? 403 : code === 'INVALID_ID' ? 400 : 502;

      console.log(`[player] videoId=${id} unavailable code=${code} client=${data.client || '?'}`);
      return res.status(status).json(
        error(code, message, {
          playabilityStatus: data.playabilityStatus || null,
          hasCipher: !!data.hasCipher,
        })
      );
    }

    // Strip internal-only fields before sending to frontend
    const payload = {
      available: true,
      videoId: data.videoId,
      title: data.title,
      artist: data.artist,
      durationSeconds: data.durationSeconds,
      artwork: data.artwork,
      streamUrl: data.streamUrl,
      mimeType: data.mimeType,
      bitrate: data.bitrate,
      hasCipher: false,
      isLive: data.isLive,
    };

    console.log(
      `[player] videoId=${id} ok client=${data.client || '?'} mime=${data.mimeType} bitrate=${data.bitrate}`
    );
    return res.status(200).json(success(payload));
  } catch (err) {
    console.error('[player] UPSTREAM_ERROR', err.message);
    return res.status(502).json(
      error('UPSTREAM_ERROR', 'Music service temporarily unavailable. Try again.', {
        reason: err.message,
      })
    );
  }
};
