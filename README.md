# MusicKx

**Premium YouTube Music streaming prototype** for testing InnerTube-compatible music logic before porting to a native Android APK (Metrolist-style).

MusicKx is **not** affiliated with YouTube, Google, Spotify, or Metrolist. It uses the same class of private InnerTube endpoints that Metrolist + InnerTubeX rely on.

---

## Architecture

```
Frontend (static HTML/CSS/JS)
        ↓
MusicKx Vercel API  (/api/*)
        ↓
InnerTube-compatible client  (lib/innertube.js)
        ↓  automatic client fallback
YouTube Music  (music.youtube.com/youtubei/v1/)
```

- Frontend **never** calls `music.youtube.com` directly.
- All requests go through `/api/search`, `/api/browse`, `/api/player`, `/api/next`, `/api/suggestions`.
- Responses are **normalized** – frontend does not depend on raw InnerTube JSON shapes.
- Client fallback order: `WEB_REMIX` → `ANDROID_MUSIC` → `IOS` → `ANDROID_VR`.

---

## Quick start

```bash
cd music-kx
npm install
npx vercel dev
```

Open the printed local URL (usually `http://localhost:3000`).

### Deploy to Vercel

```bash
npx vercel
```

Or connect the repo in the Vercel dashboard. No environment variables required for the guest (unauthenticated) prototype.

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search?q=QUERY` | Search songs, artists, albums, playlists |
| GET | `/api/browse?id=BROWSE_ID` | Home, artist, album, playlist pages |
| GET | `/api/player?id=VIDEO_ID` | Playback metadata + stream URL (when available) |
| GET | `/api/next?id=VIDEO_ID` | Queue / related tracks |
| GET | `/api/suggestions?q=QUERY` | Search autocomplete |

### Success response

```json
{ "success": true, "data": { ... } }
```

### Error response

```json
{
  "success": false,
  "error": {
    "code": "API_ERROR",
    "message": "Failed to load music data"
  }
}
```

Playback-specific errors use `PLAYBACK_UNAVAILABLE`.

---

## Project structure

```
music-kx/
├── frontend/          # Static pages (index, search, player, album, artist, playlist, library)
├── css/               # global, home, search, player, responsive
├── js/                # api, app, home, search, player, album, artist, playlist, library
├── api/               # Vercel serverless functions
├── lib/
│   ├── clients.js     # YouTube Music client configs + fallback order
│   ├── innertube.js   # POST wrapper with automatic client fallback
│   ├── parser.js      # parseSearch, parseBrowse, parsePlayer, …
│   ├── normalizer.js  # { success, data } / { success, error }
│   └── cache.js       # short-lived in-memory cache
├── package.json
├── vercel.json
└── README.md
```

---

## InnerTube adapter

`lib/innertube.js` mirrors the spirit of Metrolist’s migration to **InnerTubeX**:

1. Build a proper `context.client` block (clientName, clientVersion, UA, etc.).
2. POST JSON to `https://music.youtube.com/youtubei/v1/{endpoint}`.
3. On failure, try the next client in the fallback list instead of returning a blank page.
4. Never expose raw InnerTube payloads to the browser when a normalized shape is enough.

**Important:** InnerTube is a private, undocumented API. YouTube can change it at any time. The parser layer is intentionally isolated so response shape changes are easier to fix.

---

## UI

- Mobile-first, dark, premium, artwork-focused
- Accent colour: electric teal (`#00d4aa`) – MusicKx identity, not Spotify green
- Bottom navigation + mini-player with safe-area support
- Desktop: sidebar + persistent player bar
- Lucide-style SVG icons (no emoji)
- Skeleton loading, empty states, error + retry
- Library stored in `localStorage` (prototype only)

---

## Limitations (prototype)

| Area | Status |
|------|--------|
| Search / browse / suggestions | Implemented |
| Player stream URL | Works when InnerTube returns a direct `url` (no signatureCipher) |
| Signature cipher / n-parameter | Not fully implemented – limited playback for some tracks |
| SABR / UMP streaming | Not implemented (InnerTubeX feature) |
| Login / library sync | Not implemented – local library only |
| PO tokens / age-restricted | Limited |
| Official YouTube Data API v3 | Intentionally not used |

Full cipher deobfuscation and robust multi-client stream extraction are intended for the future **native Android** client (Metrolist / InnerTubeX stack).

---

## Security notes

- No credentials or cookies are stored or exposed.
- Query parameters are validated and length-limited.
- No arbitrary URL proxy – only fixed InnerTube endpoints are called.
- Frontend never receives sensitive session material.

---

## License

GPL-3.0 (aligned with Metrolist / InnerTubeX spirit).

This project is for educational and prototyping purposes. Users are responsible for complying with YouTube’s Terms of Service and applicable law.

## Playback resolver

`/api/player` now uses `youtubei.js` 18.x for playback resolution. The library tracks the current YouTube player script and performs the required signature/n parameter deciphering before returning a short-lived audio URL. MusicKx still returns only its normalized `/api/player` response to the frontend.

The resolver does not create fake stream URLs and does not bypass account, age, region, or private-content restrictions returned by the upstream service.
