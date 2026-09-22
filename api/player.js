const { resolveAudio } = require('../lib/youtube-player');
const { success, error } = require('../lib/normalizer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Stream URLs are short-lived and must always be freshly resolved.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json(error('METHOD_NOT_ALLOWED', 'Only GET is supported'));
  }

  const id = String(req.query.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return res.status(400).json(error('INVALID_ID', 'Valid 11-character YouTube video ID is required'));
  }

  try {
    console.log(`[player] videoId=${id} resolve`);
    const data = await resolveAudio(id);

    if (!data?.available || !data.streamUrl) {
      const code = data?.errorCode || 'PLAYBACK_UNAVAILABLE';
      const status = code === 'LOGIN_REQUIRED' ? 403 : 502;

      console.log(
        `[player] videoId=${id} unavailable code=${code} reason=${data?.reason || '-'} resolver=${data?.resolver || '-'} ` +
        `detail=${data?.detail || '-'}`
      );

      return res.status(status).json(
        error(code, data?.reason || 'Playback is currently unavailable.', {
          playabilityStatus: data?.playabilityStatus || null,
          hasCipher: !!data?.hasCipher,
          resolver: data?.resolver || null,
        })
      );
    }

    const payload = {
      available: true,
      videoId: data.videoId || id,
      title: data.title || 'Unknown',
      artist: data.artist || 'Unknown Artist',
      durationSeconds: data.durationSeconds || 0,
      artwork: data.artwork || null,
      streamUrl: data.streamUrl,
      mimeType: data.mimeType || null,
      bitrate: data.bitrate || null,
      hasCipher: false,
      isLive: !!data.isLive,
    };

    console.log(
      `[player] videoId=${id} OK resolver=${data.resolver || '-'} mime=${payload.mimeType || '-'} bitrate=${payload.bitrate || 0}`
    );
    return res.status(200).json(success(payload));
  } catch (err) {
    console.error('[player] RESOLVER_ERROR', err?.message || err);
    return res.status(502).json(
      error('UPSTREAM_ERROR', 'Music service temporarily unavailable. Try again.', {
        reason: err?.message || 'Unknown resolver error',
      })
    );
  }
};
