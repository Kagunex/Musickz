/**
 * Centralized parsers for InnerTube responses.
 * Frontend never sees raw InnerTube JSON structure.
 */

function textRuns(runs) {
  if (!runs || !Array.isArray(runs)) return '';
  return runs.map((r) => r.text || '').join('');
}

function getBestThumbnail(thumbnails) {
  if (!thumbnails || !Array.isArray(thumbnails) || thumbnails.length === 0) {
    return null;
  }
  // Prefer higher resolution
  const sorted = [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0].url || null;
}

function extractVideoId(endpoint) {
  if (!endpoint) return null;
  if (endpoint.watchEndpoint?.videoId) return endpoint.watchEndpoint.videoId;
  if (endpoint.watchEndpoint?.playlistId) return null;
  return null;
}

function extractBrowseId(endpoint) {
  if (!endpoint) return null;
  return endpoint.browseEndpoint?.browseId || null;
}

function parseDuration(text) {
  if (!text) return null;
  const parts = text.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ---------- Song / Track ---------- */

function parseSong(item) {
  if (!item) return null;

  // musicResponsiveListItemRenderer
  const r = item.musicResponsiveListItemRenderer || item.musicTwoRowItemRenderer || item;
  if (!r) return null;

  const flex = r.flexColumns || [];
  const titleCol = flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  const artistCol = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
  const albumCol = flex[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;

  const title = textRuns(titleCol) || textRuns(r.title?.runs) || r.title?.simpleText || '';
  let artist = textRuns(artistCol) || '';
  let album = textRuns(albumCol) || '';

  // Fallback from subtitle
  if (!artist && r.subtitle?.runs) {
    artist = textRuns(r.subtitle.runs);
  }

  const videoId =
    extractVideoId(r.navigationEndpoint) ||
    extractVideoId(r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint) ||
    r.playlistItemData?.videoId ||
    null;

  const thumbnails =
    r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    [];

  const durationText =
    r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text ||
    r.lengthText?.simpleText ||
    null;

  return {
    type: 'song',
    id: videoId,
    videoId,
    title: title.trim() || 'Unknown',
    artist: artist.trim() || 'Unknown Artist',
    album: album.trim() || null,
    duration: durationText,
    durationSeconds: parseDuration(durationText),
    artwork: getBestThumbnail(thumbnails),
    thumbnails: thumbnails.map((t) => ({ url: t.url, width: t.width, height: t.height })),
  };
}

/* ---------- Artist ---------- */

function parseArtist(item) {
  if (!item) return null;
  const r = item.musicResponsiveListItemRenderer || item.musicTwoRowItemRenderer || item;

  const title =
    textRuns(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) ||
    textRuns(r.title?.runs) ||
    '';

  const browseId =
    extractBrowseId(r.navigationEndpoint) ||
    extractBrowseId(r.title?.runs?.[0]?.navigationEndpoint);

  const thumbnails =
    r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    [];

  const subtitle = textRuns(r.subtitle?.runs) || textRuns(r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);

  return {
    type: 'artist',
    id: browseId,
    browseId,
    name: title.trim() || 'Unknown Artist',
    subtitle: subtitle || null,
    artwork: getBestThumbnail(thumbnails),
    thumbnails: thumbnails.map((t) => ({ url: t.url, width: t.width, height: t.height })),
  };
}

/* ---------- Album ---------- */

function parseAlbum(item) {
  if (!item) return null;
  const r = item.musicTwoRowItemRenderer || item.musicResponsiveListItemRenderer || item;

  const title =
    textRuns(r.title?.runs) ||
    textRuns(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) ||
    '';

  const subtitle =
    textRuns(r.subtitle?.runs) ||
    textRuns(r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) ||
    '';

  const browseId = extractBrowseId(r.navigationEndpoint);

  const thumbnails =
    r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    [];

  return {
    type: 'album',
    id: browseId,
    browseId,
    title: title.trim() || 'Unknown Album',
    artist: subtitle.trim() || null,
    year: null,
    artwork: getBestThumbnail(thumbnails),
    thumbnails: thumbnails.map((t) => ({ url: t.url, width: t.width, height: t.height })),
  };
}

/* ---------- Playlist ---------- */

function parsePlaylist(item) {
  if (!item) return null;
  const r = item.musicTwoRowItemRenderer || item.musicResponsiveListItemRenderer || item;

  const title =
    textRuns(r.title?.runs) ||
    textRuns(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) ||
    '';

  const subtitle =
    textRuns(r.subtitle?.runs) ||
    textRuns(r.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) ||
    '';

  const browseId = extractBrowseId(r.navigationEndpoint);

  const thumbnails =
    r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    [];

  return {
    type: 'playlist',
    id: browseId,
    browseId,
    title: title.trim() || 'Unknown Playlist',
    description: subtitle.trim() || null,
    artwork: getBestThumbnail(thumbnails),
    thumbnails: thumbnails.map((t) => ({ url: t.url, width: t.width, height: t.height })),
  };
}

/* ---------- Search ---------- */

function classifyAndPush(item, result) {
  if (!item) return;

  if (item.musicResponsiveListItemRenderer) {
    const r = item.musicResponsiveListItemRenderer;
    const pageType =
      r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType ||
      r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]
        ?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType;

    const hasWatch =
      r.playlistItemData?.videoId ||
      r.navigationEndpoint?.watchEndpoint?.videoId ||
      r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
        ?.playNavigationEndpoint?.watchEndpoint?.videoId;

    if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') {
      const a = parseArtist(item);
      if (a?.id) result.artists.push(a);
    } else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') {
      const al = parseAlbum(item);
      if (al?.id) result.albums.push(al);
    } else if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') {
      const p = parsePlaylist(item);
      if (p?.id) result.playlists.push(p);
    } else if (hasWatch) {
      const s = parseSong(item);
      if (s?.videoId) result.songs.push(s);
    } else {
      // try artist/album from browse
      const a = parseArtist(item);
      if (a?.id) result.artists.push(a);
      else {
        const al = parseAlbum(item);
        if (al?.id) result.albums.push(al);
      }
    }
  } else if (item.musicTwoRowItemRenderer) {
    const pageType =
      item.musicTwoRowItemRenderer.navigationEndpoint?.browseEndpoint
        ?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
    if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') {
      const al = parseAlbum(item);
      if (al?.id) result.albums.push(al);
    } else if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') {
      const p = parsePlaylist(item);
      if (p?.id) result.playlists.push(p);
    } else if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') {
      const a = parseArtist(item);
      if (a?.id) result.artists.push(a);
    }
  } else if (item.musicCardShelfRenderer) {
    // Top result card – treat title as possible artist/song
    const card = item.musicCardShelfRenderer;
    const s = parseSong({ musicResponsiveListItemRenderer: {
      flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: card.title } }],
      thumbnail: card.thumbnail,
      navigationEndpoint: card.onTap || card.title?.runs?.[0]?.navigationEndpoint,
    }});
    if (s?.videoId) result.songs.push(s);
    else {
      const a = parseArtist({ musicResponsiveListItemRenderer: {
        flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: card.title } }],
        thumbnail: card.thumbnail,
        navigationEndpoint: card.onTap || card.title?.runs?.[0]?.navigationEndpoint,
      }});
      if (a?.id) result.artists.push(a);
    }
  }
}

function parseSearch(raw) {
  const result = {
    songs: [],
    artists: [],
    albums: [],
    playlists: [],
  };

  if (!raw) return result;

  const tabs =
    raw.contents?.tabbedSearchResultsRenderer?.tabs ||
    raw.contents?.sectionListRenderer?.contents ||
    [];

  const sections = [];

  for (const tab of tabs) {
    const content = tab.tabRenderer?.content || tab;
    const sectionList = content.sectionListRenderer?.contents || content.contents || [];
    sections.push(...sectionList);
  }

  if (raw.contents?.sectionListRenderer?.contents) {
    sections.push(...raw.contents.sectionListRenderer.contents);
  }

  for (const section of sections) {
    // Direct shelf
    const shelf = section.musicShelfRenderer || section.musicCardShelfRenderer;
    if (shelf) {
      const items = shelf.contents || [section];
      for (const item of items) classifyAndPush(item, result);
      continue;
    }

    // itemSectionRenderer (common in current YT Music search)
    if (section.itemSectionRenderer) {
      const items = section.itemSectionRenderer.contents || [];
      for (const item of items) {
        if (item.musicShelfRenderer) {
          for (const c of item.musicShelfRenderer.contents || []) classifyAndPush(c, result);
        } else {
          classifyAndPush(item, result);
        }
      }
    }
  }

  const dedupe = (arr, key) => {
    const seen = new Set();
    return arr.filter((x) => {
      const k = x[key];
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  result.songs = dedupe(result.songs, 'videoId');
  result.artists = dedupe(result.artists, 'id');
  result.albums = dedupe(result.albums, 'id');
  result.playlists = dedupe(result.playlists, 'id');

  return result;
}

/* ---------- Browse (Home / Artist / Album / Playlist) ---------- */

function parseBrowse(raw) {
  if (!raw) return { header: null, sections: [] };

  const header = parseBrowseHeader(raw);
  const sections = [];

  const contents =
    raw.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents ||
    raw.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer
      ?.contents ||
    raw.contents?.sectionListRenderer?.contents ||
    [];

  for (const section of contents) {
    const carousel = section.musicCarouselShelfRenderer;
    const shelf = section.musicShelfRenderer;
    const grid = section.gridRenderer;

    if (carousel) {
      const title = textRuns(carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs);
      const items = (carousel.contents || [])
        .map((c) => {
          if (c.musicTwoRowItemRenderer) {
            const pageType =
              c.musicTwoRowItemRenderer.navigationEndpoint?.browseEndpoint
                ?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig
                ?.pageType;
            if (pageType === 'MUSIC_PAGE_TYPE_ARTIST') return parseArtist(c);
            if (pageType === 'MUSIC_PAGE_TYPE_ALBUM') return parseAlbum(c);
            if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') return parsePlaylist(c);
            return parseSong(c) || parseAlbum(c) || parsePlaylist(c);
          }
          if (c.musicResponsiveListItemRenderer) return parseSong(c);
          return null;
        })
        .filter(Boolean);

      if (items.length) {
        sections.push({ title: title || 'Recommended', items, type: 'carousel' });
      }
    } else if (shelf) {
      const title = textRuns(shelf.title?.runs);
      const items = (shelf.contents || [])
        .map((c) => parseSong(c) || parseArtist(c))
        .filter(Boolean);
      if (items.length) {
        sections.push({ title: title || 'Tracks', items, type: 'list' });
      }
    } else if (grid) {
      const items = (grid.items || [])
        .map((c) => parseAlbum(c) || parsePlaylist(c) || parseArtist(c))
        .filter(Boolean);
      if (items.length) {
        sections.push({ title: 'Items', items, type: 'grid' });
      }
    }
  }

  // Album / playlist track list often in musicPlaylistShelfRenderer
  const playlistShelf =
    raw.contents?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer
      ?.contents?.[0]?.musicPlaylistShelfRenderer ||
    raw.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
      ?.sectionListRenderer?.contents?.find((c) => c.musicPlaylistShelfRenderer)
      ?.musicPlaylistShelfRenderer;

  if (playlistShelf) {
    const tracks = (playlistShelf.contents || [])
      .map((c) => parseSong(c))
      .filter((s) => s?.videoId);
    if (tracks.length) {
      sections.push({ title: 'Tracks', items: tracks, type: 'tracks' });
    }
  }

  return { header, sections };
}

function parseBrowseHeader(raw) {
  const header =
    raw.header?.musicDetailHeaderRenderer ||
    raw.header?.musicImmersiveHeaderRenderer ||
    raw.header?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicDetailHeaderRenderer ||
    raw.header?.musicResponsiveHeaderRenderer;

  if (!header) {
    // Try microformat
    const mf = raw.microformat?.microformatDataRenderer;
    if (mf) {
      return {
        title: mf.title || null,
        subtitle: mf.description || null,
        artwork: getBestThumbnail(mf.thumbnail?.thumbnails),
        year: null,
        trackCount: null,
      };
    }
    return null;
  }

  const title = textRuns(header.title?.runs) || header.title?.simpleText || '';
  const subtitle = textRuns(header.subtitle?.runs) || textRuns(header.secondSubtitle?.runs) || '';
  const thumbnails =
    header.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ||
    header.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
    header.thumbnail?.thumbnails ||
    [];

  return {
    title: title.trim(),
    subtitle: subtitle.trim(),
    description: textRuns(header.description?.runs) || null,
    artwork: getBestThumbnail(thumbnails),
    year: null,
    trackCount: null,
  };
}

/* ---------- Player ---------- */

function parsePlayer(raw) {
  if (!raw) return null;

  const vd = raw.videoDetails;
  const micro = raw.microformat?.playerMicroformatRenderer;

  if (!vd && !micro) {
    // Check playability
    const status = raw.playabilityStatus;
    if (status && status.status !== 'OK') {
      return {
        available: false,
        reason: status.reason || status.status || 'Playback unavailable',
        errorCode: status.errorScreen?.playerErrorMessageRenderer?.reason?.simpleText || status.status,
      };
    }
    return null;
  }

  const formats = [
    ...(raw.streamingData?.adaptiveFormats || []),
    ...(raw.streamingData?.formats || []),
  ];

  // Prefer audio-only
  const audioFormats = formats
    .filter((f) => f.mimeType?.includes('audio') && (f.url || f.signatureCipher))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const bestAudio = audioFormats[0] || null;

  return {
    available: true,
    videoId: vd?.videoId || null,
    title: vd?.title || micro?.title?.simpleText || 'Unknown',
    artist: vd?.author || micro?.ownerChannelName || 'Unknown Artist',
    durationSeconds: parseInt(vd?.lengthSeconds || micro?.lengthSeconds || 0, 10),
    artwork:
      getBestThumbnail(vd?.thumbnail?.thumbnails) ||
      getBestThumbnail(micro?.thumbnail?.thumbnails),
    streamUrl: bestAudio?.url || null,
    mimeType: bestAudio?.mimeType || null,
    bitrate: bestAudio?.bitrate || null,
    // Note: signatureCipher streams require deciphering (not implemented in this prototype)
    hasCipher: !!(bestAudio && !bestAudio.url && bestAudio.signatureCipher),
    isLive: !!vd?.isLiveContent,
  };
}

/* ---------- Next / Queue ---------- */

function parseNext(raw) {
  if (!raw) return { current: null, queue: [], related: [] };

  const panel =
    raw.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
      ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer
      ?.content?.playlistPanelRenderer ||
    raw.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]
      ?.itemSectionRenderer?.contents?.[0]?.playlistPanelRenderer;

  const queue = [];
  if (panel?.contents) {
    for (const item of panel.contents) {
      const r = item.playlistPanelVideoRenderer;
      if (!r) continue;
      const videoId = r.videoId || extractVideoId(r.navigationEndpoint);
      const title = textRuns(r.title?.runs) || r.title?.simpleText || '';
      const artist = textRuns(r.shortBylineText?.runs) || textRuns(r.longBylineText?.runs) || '';
      const duration = r.lengthText?.simpleText || null;
      const thumbnails = r.thumbnail?.thumbnails || [];
      if (videoId) {
        queue.push({
          type: 'song',
          videoId,
          title: title.trim(),
          artist: artist.trim(),
          duration,
          artwork: getBestThumbnail(thumbnails),
        });
      }
    }
  }

  return {
    current: queue[0] || null,
    queue,
    related: queue.slice(1),
  };
}

/* ---------- Suggestions ---------- */

function parseSuggestions(raw) {
  if (!raw) return [];
  const contents =
    raw.contents?.[0]?.searchSuggestionsSectionRenderer?.contents ||
    raw.contents ||
    [];

  const suggestions = [];
  for (const item of contents) {
    const r = item.searchSuggestionRenderer || item.musicResponsiveListItemRenderer;
    if (!r) continue;
    const text =
      textRuns(r.suggestion?.runs) ||
      textRuns(r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs) ||
      '';
    if (text) suggestions.push(text.trim());
  }
  return suggestions;
}

module.exports = {
  parseSearch,
  parseSong,
  parseArtist,
  parseAlbum,
  parsePlaylist,
  parseBrowse,
  parsePlayer,
  parseNext,
  parseSuggestions,
  textRuns,
  getBestThumbnail,
  formatDuration,
};
