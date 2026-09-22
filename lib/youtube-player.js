/**
 * MusicKx playback resolver.
 *
 * Uses youtubei.js for the playback-specific part because it tracks YouTube's
 * current player script and handles signature/n deciphering. This keeps the
 * existing /api/player contract while avoiding hard-coded, stale client
 * versions in the old hand-written resolver.
 *
 * This resolver does not manufacture stream URLs and does not bypass account,
 * age, region, or private-content restrictions returned by YouTube.
 */

let innertubePromise = null;

function getStatus(info) {
  return (
    info?.playability_status?.status ||
    info?.playabilityStatus?.status ||
    info?.page?.playabilityStatus?.status ||
    null
  );
}

function getReason(info) {
  return (
    info?.playability_status?.reason ||
    info?.playabilityStatus?.reason ||
    info?.page?.playabilityStatus?.reason ||
    null
  );
}

function getBasicInfo(info) {
  const b = info?.basic_info || info?.video_details || info?.videoDetails || {};
  return {
    videoId: b.id || b.video_id || b.videoId || null,
    title: b.title || null,
    artist: b.author || b.author_name || b.owner_channel_name || null,
    durationSeconds: Number(b.duration || b.length_seconds || b.lengthSeconds || 0) || 0,
    artwork:
      b.thumbnail?.[0]?.url ||
      b.thumbnail?.thumbnails?.[0]?.url ||
      b.thumbnails?.[0]?.url ||
      null,
    isLive: Boolean(b.is_live || b.isLiveContent || b.is_live_content),
  };
}

async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = (async () => {
      const mod = await import('youtubei.js');
      const Innertube = mod.Innertube || mod.default;
      if (!Innertube?.create) {
        throw new Error('youtubei.js Innertube.create() is unavailable');
      }

      // Keep the session in memory for warm Vercel invocations. No user
      // cookies or account credentials are stored by MusicKx.
      return Innertube.create({
        generate_session_locally: true,
      });
    })().catch((err) => {
      innertubePromise = null;
      throw err;
    });
  }
  return innertubePromise;
}

function classifyFailure(status, reason) {
  const s = String(status || '').toUpperCase();
  const r = String(reason || '').toLowerCase();

  if (s === 'LOGIN_REQUIRED') {
    return {
      errorCode: 'LOGIN_REQUIRED',
      reason: reason || 'YouTube requires sign-in for this track.',
    };
  }

  if (s === 'AGE_CHECK_REQUIRED' || s === 'CONTENT_CHECK_REQUIRED') {
    return {
      errorCode: 'PLAYBACK_UNAVAILABLE',
      reason: 'This track requires additional content verification.',
    };
  }

  if (s === 'UNPLAYABLE') {
    if (r.includes('country') || r.includes('region')) {
      return {
        errorCode: 'PLAYBACK_UNAVAILABLE',
        reason: 'This track is not available in this region.',
      };
    }
    return {
      errorCode: 'PLAYBACK_UNAVAILABLE',
      reason: reason || 'This track is currently unavailable.',
    };
  }

  return {
    errorCode: 'PLAYBACK_UNAVAILABLE',
    reason: reason || 'Playback is currently unavailable.',
  };
}

const PLAYER_CLIENTS = [
  // youtubei.js 18.0.0 added VISIONOS support; current 2026 reports show it
  // can provide usable anonymous playback where older Android/VR clients are
  // bot-checked. Keep this first.
  'VISIONOS',
  // Music client: useful fallback for YouTube Music responses.
  'WEB_REMIX',
  'YTMUSIC',
  // Last-resort legacy mobile client. It is not guaranteed and is intentionally
  // after the two current clients above.
  'IOS',
];

function getFailureResult(videoId, meta, failures) {
  const login = failures.find((x) => x.errorCode === 'LOGIN_REQUIRED');
  const unavailable = failures.find((x) => x.errorCode === 'PLAYBACK_UNAVAILABLE');
  const first = failures[0] || {};

  return {
    available: false,
    ...meta,
    videoId: meta.videoId || videoId,
    streamUrl: null,
    mimeType: first.mimeType || null,
    bitrate: first.bitrate || null,
    hasCipher: failures.some((x) => x.hasCipher),
    errorCode: login && failures.every((x) => x.errorCode === 'LOGIN_REQUIRED')
      ? 'LOGIN_REQUIRED'
      : (unavailable?.errorCode || first.errorCode || 'PLAYBACK_UNAVAILABLE'),
    reason:
      login && failures.every((x) => x.errorCode === 'LOGIN_REQUIRED')
        ? (login.reason || 'YouTube requires sign-in for this track.')
        : (unavailable?.reason || first.reason || 'Playback is currently unavailable.'),
    resolver: 'youtubei.js-multi-client',
    attempts: failures.map((x) => ({
      client: x.client,
      status: x.status || null,
      errorCode: x.errorCode || null,
      reason: x.reason || null,
    })),
  };
}

async function resolveAudio(videoId) {
  const yt = await getInnertube();
  const failures = [];
  let lastMeta = { videoId, title: null, artist: null, durationSeconds: 0, artwork: null, isLive: false };

  for (const client of PLAYER_CLIENTS) {
    try {
      console.log(`[player] ${videoId} trying client=${client}`);
      const info = await yt.getBasicInfo(videoId, { client });
      const meta = getBasicInfo(info);
      lastMeta = { ...lastMeta, ...meta };

      const status = getStatus(info);
      const reason = getReason(info);

      if (status && status !== 'OK') {
        const failure = {
          client,
          status,
          ...classifyFailure(status, reason),
          hasCipher: Boolean(
            info?.streaming_data?.adaptive_formats?.some((f) => f.signature_cipher || f.cipher)
          ),
        };
        failures.push(failure);
        console.warn(`[player] ${videoId} client=${client} status=${status} reason=${reason || '-'}`);
        continue;
      }

      let format;
      try {
        format = info.chooseFormat({ type: 'audio', quality: 'best' });
      } catch (err) {
        failures.push({
          client,
          errorCode: 'NO_AUDIO_STREAM',
          reason: 'No playable audio stream was returned for this client.',
          hasCipher: Boolean(
            info?.streaming_data?.adaptive_formats?.some((f) => f.signature_cipher || f.cipher)
          ),
          detail: err?.message || null,
        });
        continue;
      }

      if (!format) {
        failures.push({
          client,
          errorCode: 'NO_AUDIO_STREAM',
          reason: 'No playable audio stream was returned for this client.',
          hasCipher: false,
        });
        continue;
      }

      let streamUrl = format.url || null;
      try {
        // youtubei.js handles both signature deciphering and the current n-transform.
        streamUrl = await format.decipher(yt.session.player);
      } catch (err) {
        failures.push({
          client,
          errorCode: 'STREAM_RESOLUTION_FAILED',
          reason: 'The music stream could not be resolved from this client.',
          mimeType: format.mime_type || format.mimeType || null,
          bitrate: format.bitrate || format.average_bitrate || null,
          hasCipher: Boolean(format.signature_cipher || format.cipher),
          detail: err?.message || null,
        });
        continue;
      }

      if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) {
        failures.push({
          client,
          errorCode: 'NO_AUDIO_STREAM',
          reason: 'The client did not return a playable audio URL.',
          mimeType: format.mime_type || format.mimeType || null,
          bitrate: format.bitrate || format.average_bitrate || null,
          hasCipher: Boolean(format.signature_cipher || format.cipher),
        });
        continue;
      }

      console.log(`[player] ${videoId} success client=${client}`);
      return {
        available: true,
        ...lastMeta,
        streamUrl,
        mimeType: format.mime_type || format.mimeType || null,
        bitrate: format.bitrate || format.average_bitrate || null,
        hasCipher: false,
        reason: null,
        errorCode: null,
        resolver: `youtubei.js:${client}`,
      };
    } catch (err) {
      failures.push({
        client,
        errorCode: 'CLIENT_ERROR',
        reason: 'Playback client request failed.',
        detail: err?.message || null,
      });
      console.warn(`[player] ${videoId} client=${client} error=${err?.message || err}`);
    }
  }

  return getFailureResult(videoId, lastMeta, failures);
}

module.exports = {
  resolveAudio,
  getInnertube,
};
