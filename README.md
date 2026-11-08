# OmniConvert Studio

<div align="center">

**The Definitive, Zero-Network, Matte-Monochrome Universal Conversion & Developer Engine**

[![MIT License](https://img.shields.io/badge/License-MIT-27272a.svg?style=flat-square)](LICENSE)
[![Zero Network](https://img.shields.io/badge/Network-0%20Bytes%20Runtime-27272a.svg?style=flat-square&logo=shield)](index.html)
[![100% Client-Side](https://img.shields.io/badge/Execution-100%25%20Client--Side-27272a.svg?style=flat-square)](src/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline--First-27272a.svg?style=flat-square)](public/sw.js)
[![Docker Size](https://img.shields.io/badge/Docker-%3C20MB%20Alpine-27272a.svg?style=flat-square)](Dockerfile)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%205.x-27272a.svg?style=flat-square&logo=typescript)](tsconfig.json)

<br />

```
  ____                  _ _____                          _     ____  _             _ _       
 / __ \                (_)  __ \                        | |   / ____|| |           | (_)      
| |  | |_ __ ___  _ __  _| /  \/ ___  _ ____   _____ _ _| |_ | (___  | |_ _   _  __| |_  ___  
| |  | | '_ ` _ \| '_ \| | |    / _ \| '_ \ \ / / _ \ '__| __| \___ \ | __| | | |/ _` | |/ _ \ 
| |__| | | | | | | | | | | \__/\ (_) | | | \ V /  __/ |  | |_  ____) || |_| |_| | (_| | | (_) |
 \____/|_| |_| |_|_| |_|_|\_____/\___/|_| |_|\_/ \___|_|   \__||_____/  \__|\__,_|\__,_|_|\___/ 
```

<p align="center">
  <em>A high-performance offline studio for 3D meshes, images, documents, audio, video, archives, and developer utilities. Never uploads a single byte. Runs buttery-smooth at 60 FPS on any potato PC.</em>
</p>

</div>

---

## 📸 Interface Preview

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  OMNICONVERT STUDIO   [ All ] [ 3D & CAD ] [ Images ] [ Documents ] [ Audio & Video ] [ Dev ]  │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│       ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐          │
│         [⇪] Drop 3D meshes, images, spreadsheets, audio, or archives here                        │
│             Smart automatic MIME/format inspection & instant target action pills                 │
│       └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘          │
│                                                                                                  │
│       BATCH QUEUE:                                                                               │
│       ├─ model.3mf       (4.2 MB)  →  [ To STL ]  [ To OBJ ]  [ 3D Orbit Inspect ]               │
│       ├─ financial.xlsx  (1.8 MB)  →  [ To CSV ]  [ To JSON ] [ To HTML Table ]                  │
│       └─ recording.mp4   (14 MB)   →  [ To GIF ]  [ Extract WAV ]                                │
│                                                                                                  │
│       [ ⚡ Execute All in Parallel Workers ]    [ 📦 Download All as ZIP ]                       │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

> **UI Screenshots**: Drop your screenshot assets into `docs/screenshots/` (e.g. `hub-dark.png`, `cad-preview.png`, `documents.png`).

---

## ⚡ Core Philosophy & Non-Negotiables

1. **Strict Zero-Network Enforcement**
   - Hardened Content Security Policy (`connect-src 'none'; default-src 'self'`) configured at both the HTML `<meta>` tag and the reverse-proxy `nginx.conf` levels.
   - Zero remote telemetry, zero third-party trackers, zero CDN asset fetching at runtime.

2. **Matte Monochrome Design System (Zero-Neon Policy)**
   - Exclusively styled in subtle zinc tones (`#09090b` / `#18181b` / `#27272a`) with crisp monochrome accents (`#f4f4f5` / `#a1a1aa`).
   - No saturated cyans, greens, purples, or radiant glowing shadows.

3. **Low-Spec / Potato-PC Compliance (60 FPS Guaranteed)**
   - No heavy dependencies: **Zero** Monaco Editor, **Zero** Moment.js, **Zero** Lodash.
   - Custom lightweight Virtualized Rendering engine (`src/components/VirtualList.tsx`) keeps DOM node count under control even when previewing 100,000+ spreadsheet cells, diff lines, or cryptographic tokens.

4. **Multi-Threaded Dedicated Web Worker Architecture**
   - Heavy parsing, format transcoders, and cryptographic hashing run in isolated background Web Workers (`src/workers/`).
   - The main UI thread never blocks or drops frames during compute-intensive tasks.

5. **Universal Memory-Safe Stream Dropzone**
   - Employs the native Web Streams API (`ReadableStream`, chunked `TextDecoder`) to handle file drops up to 100MB without overflowing browser tab memory.

---

## 🗂️ Comprehensive Feature Matrix

| Category | Formats & Tools | Key Capabilities | Worker Acceleration |
|:---|:---|:---|:---:|
| **3D & CAD Laboratory** | `3MF`, `STL` (ASCII & Binary), `OBJ`, `PLY`, `GLTF`, `GLB` | Interactive 3D drag-orbit preview, wireframe/solid toggle, polygon/vertex counter, normal inverter, and scale multiplier. | `cad.worker.ts` |
| **Image & Vector Engine** | `WebP`, `PNG`, `JPG`, `BMP`, `TIFF`, `HEIC`, `HEIF`, `SVG`, `ICO` | Multi-resolution `.ICO` generator (`16x16` to `256x256`), EXIF metadata stripper, SVG multi-scale rasterizer (`1x`, `2x`, `4x`), lossy/lossless quality sliders. | Canvas / Offscreen |
| **Document & Tabular Suite** | `PDF`, `XLSX`, `XLS`, `CSV`, `TSV`, `JSON`, `HTML Table` | Client-side PDF-1.4 compiler (`Images → PDF`), multi-page PDF image extractor (`PDF → ZIP`), CSV chunked splitter, and bidirectional spreadsheet parser. | `tabular.worker.ts` |
| **Audio & Video Fast Converter** | `WAV`, `MP3`, `OGG`, `AAC`, `FLAC`, `MP4`, `WebM`, `MKV` | Animated GIF89a generator (custom FPS, loop count, dimension scaler), interactive waveform visualizer, and raw audio track extractor. | Canvas / AudioContext |
| **Archive & Fonts** | `ZIP`, `TAR`, `GZ`, `TTF`, `OTF`, `WOFF`, `WOFF2` | In-memory archive inspector & extractor, encrypted ZIP creator, font container transcoder, and interactive Glyph Inspector. | `DecompressionStream` |
| **Developer Utilities** | JSON Studio, JWT Deep Inspector, Diff Checker, Universal Crypto Hasher, Bulk Regex Lab | JSONPath query engine, collapsible JSON tree, HMAC offline validation, Myers unified/side-by-side diff with intra-line change highlighting, bulk UUID v4 generator. | `json.worker.ts`<br>`diff.worker.ts`<br>`crypto.worker.ts`<br>`regex.worker.ts` |

---

## ⌨️ Global Shortcuts & Productivity

- `Ctrl + K` / `Cmd + K`: Raycast-style instant Command Palette launcher across all converters and developer tools.
- `Ctrl + Enter` / `Cmd + Enter`: Instant execution of active studio action.
- `Tool Chaining / Pipeline`: Directly pipe outputs between tools (e.g. `Extract Audio -> Transcode -> Hasher` or `Payload -> Base64 Decode -> JSON Prettify`).
- `Auto-Persistence`: All active tabs and workspace inputs are automatically mirrored to local `IndexedDB` (`idb-keyval`).

---

## 🌍 Internationalization (i18n)

OmniConvert Studio features a zero-overhead, dynamic lazy-loading i18n architecture. The core application loads in English (`en`), while language bundles are fetched on-demand:

- 🇺🇸 **English** (`en`) — Source of truth
- 🇹🇷 **Türkçe** (`tr`)
- 🇧🇬 **Български** (`bg`)
- 🇩🇪 **Deutsch** (`de`)
- 🇪🇸 **Español** (`es`)

Zero hardcoded strings; all badges, buttons, errors, and tooltips are localized.

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- `npm` or `pnpm`

### Installation & Development Server

```bash
# 1. Clone repository
git clone https://github.com/your-username/omniconvert-studio.git
cd omniconvert-studio

# 2. Install dependencies
npm install

# 3. Start high-speed Vite dev server
npm run dev
```

Open your browser at `http://localhost:5173`.

### Production Build & Typecheck

```bash
npm run build
```

The compiled, zero-network static assets will be output to `./dist/`.

---

## 🐳 Self-Hosting via Docker (< 20MB Final Image)

For air-gapped homelabs, developer servers, or local intranets, a multi-stage Alpine Nginx container is provided:

```bash
# Build lightweight Alpine image
docker build -t omniconvert-studio:latest .

# Run container on port 8080
docker run -d \
  --name omniconvert \
  --restart unless-stopped \
  -p 8080:8080 \
  omniconvert-studio:latest
```

The container includes:
- Embedded Content Security Policy headers
- Gzip static asset compression
- Hardened non-root user permissions
- Total image size: `< 20 MB`

---

## 📦 Automated GitHub Pages Deployment

The repository includes a ready-to-use GitHub Actions workflow located at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

### Enabling GitHub Pages in 2 Steps:
1. Go to your GitHub repository: **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Every push to the `main` branch will automatically typecheck, compile, and deploy the application to your GitHub Pages URL (`https://<username>.github.io/<repo-name>/`).

---

## 🧱 Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── deploy.yml           # Automated CI/CD GitHub Pages deployment
├── public/
│   ├── icon.svg                 # Monochrome vector branding icon
│   ├── manifest.webmanifest     # Progressive Web App manifest
│   └── sw.js                    # Offline-first Service Worker
├── src/
│   ├── components/              # Shell, Navbar, CommandPalette, SplitPane, Dropzone
│   ├── config/                  # Tool registry, category metadata, pipeline definitions
│   ├── hooks/                   # useWorker, useI18n, useWorkspaceStore (IndexedDB)
│   ├── locales/                 # en.json, tr.json, bg.json, de.json, es.json
│   ├── tools/                   # Isolated feature studios:
│   │   ├── archives-fonts/      # In-memory ZIP/TAR/GZ & TTF/WOFF/WOFF2 font inspector
│   │   ├── audio-video/         # WAV transcoders, waveform visualizer, GIF89a encoder
│   │   ├── cad-3d/              # 3MF, STL, OBJ, PLY, GLTF/GLB with 3D orbit canvas
│   │   ├── crypto-hasher/       # Web Crypto SHA/HMAC/MD5 and bulk UUID generator
│   │   ├── diff-checker/        # Line & intra-line Myers diff engine
│   │   ├── documents/           # PDF compiler, page extractor, XLSX/CSV parser
│   │   ├── image-optimizer/     # Lossless SVG cleaner & canvas resizer
│   │   ├── json-studio/         # Collapsible tree, JSONPath evaluator, formatter
│   │   ├── jwt-inspector/       # Color-coded token parser & HMAC validator
│   │   ├── media-images/        # HEIC/TIFF/WebP/PNG converter & multi-size ICO builder
│   │   ├── regex-lab/           # Regex matcher with live capture groups & text lab
│   │   └── universal-hub/       # Center-stage smart dropzone & parallel batch queue
│   ├── workers/                 # Dedicated Web Workers (cad, tabular, json, diff, crypto)
│   ├── App.tsx                  # Main application orchestrator
│   └── main.tsx                 # Entrypoint & PWA service worker registration
├── Dockerfile                   # Multi-stage <20MB Alpine Nginx image
├── nginx.conf                   # Hardened CSP, gzip, and SPA fallback server config
├── package.json
└── vite.config.ts               # Vite bundler with relative base & worker optimizations
```

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
Feel free to use, modify, and self-host for personal or commercial projects.
