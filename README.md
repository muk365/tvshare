# 🍿 CineSync — P2P Synchronized Video Sharing

A sleek, fluid, and modern watch party web application that lets a **Host** stream any local video file directly from their computer to **Clients** in real time with synchronized playback, sub-second latency, and completely **independent sound volume**.

Built with pure modern Web APIs (WebRTC, Web Audio API, Canvas, HTML5 Video, CSS Glassmorphism) with zero server maintenance and zero database costs.

---

## ✨ Features

- ⚡ **Direct P2P Streaming from Local Files**:
  The host selects any local video file (`.mp4`, `.webm`, `.mkv`, `.mov`) from their computer via drag-and-drop or file picker. Video and audio are streamed directly to connected viewers via WebRTC.
- 🔄 **Real-Time Synchronized Controls**:
  - Play / Pause (synchronized across host and all clients).
  - Skip Backward **-5s** and Skip Forward **+5s** (synchronized).
  - Interactive timeline scrubber with timestamp hover tooltips.
  - Host permission toggle: Host can lock controls or allow guests to control playback.
- 💬 **Subtitles & Captions Support (.SRT & .VTT)**:
  - Upload any `.srt` or `.vtt` file directly from your computer (at room creation or on-the-fly during playback).
  - **Auto-Sync to Viewers**: When the host uploads a subtitle file, it is automatically converted to WebVTT and streamed to all connected viewers over WebRTC DataChannel!
  - **Independent Toggle & Customization**: Each viewer can toggle subtitles ON/OFF individually (CC button).
  - **Sync Offset Stepper**: Adjust subtitle timing by +/- 0.5s on the fly to match audio perfectly.
  - **Font Size Control**: Small, Medium, Large size pills.
- 🔊 **Isolated Independent Audio**:
  - Utilizing the **Web Audio API** (`AudioContext`, `createMediaElementSource`, `createGain`, `createMediaStreamDestination`), the host's local speaker gain is completely isolated from the streamed audio track.
  - The host can lower their speaker volume or mute entirely without lowering the viewers' audio!
  - Each viewer controls their own local volume slider independently.
- 🎨 **Fluid & Highly Animated Neo-Cinema Design**:
  - Deep dark obsidian aesthetics with vibrant electric violet, cyber cyan, and neon rose accents.
  - **Dynamic Ambient Cinema Backlight**: Live canvas samples video frames to softly cast matching ambient light behind the player (Philips Hue / cinema glow effect).
  - **Animated Center Splash Feedback**: Netflix/YouTube-style pulsing play, pause, +5s, and -5s badges in the center of the video.
  - **Floating Emoji Reactions**: Live animated emoji physics engine (❤️, 🔥, 🍿, 😂, 👏, 🎉) that float up the screen on interaction.
- 💬 **Live Chat & Presence**:
  - Real-time room chat with custom display names and colorful avatars.
  - Live connected viewer counter and viewer list drawer.
- 📱 **Instant Invite & QR Code**:
  - 1-click invite link copying (`?room=tv-xxxxxx`).
  - Built-in live QR Code generator for instant mobile camera scanning.
  - Procedural Synthwave Demo Generator for instant testing without needing a local video file.

---

## 🚀 Free Hosting & Deployment Guide

This app is 100% client-side with zero build steps required. It can be hosted on any free static hosting platform in under 60 seconds:

### 1. Netlify (Recommended)
**Option A: Netlify Drop (Zero CLI / No Git required)**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag and drop this whole `tvshare` folder onto the page.
3. Your watch party app is instantly live with a free HTTPS URL!

**Option B: Netlify Git**
1. Push this folder to a GitHub/GitLab repository.
2. In Netlify, click **"Add new site" > "Import an existing project"**.
3. Set Publish directory to `.` (the root).
4. Netlify will use the included `netlify.toml` automatically.

### 2. Render (Free Web Service / Static Site)
1. Push the code to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), click **New + > Static Site**.
3. Connect your repository.
4. Set:
   - **Build Command**: *(leave blank)*
   - **Publish Directory**: `./`
5. Render reads `render.yaml` and deploys your site with free SSL.

### 3. Vercel
1. Run `npx vercel` in this folder or import your Git repository on [vercel.com](https://vercel.com).
2. The included `vercel.json` will route all requests seamlessly.

### 4. GitHub Pages
1. Push to your GitHub repository.
2. In repository **Settings > Pages**, choose `main` branch and `/ (root)` folder.
3. The included `.nojekyll` file ensures all assets load properly.

---

## 💻 Local Testing & Usage

Since this project resides in `d:\XAMPP\htdocs\tvshare`:

1. **Via XAMPP / Apache**:
   - Start Apache in the XAMPP Control Panel.
   - Open [http://localhost/tvshare/](http://localhost/tvshare/) in your browser.

2. **Via any static server**:
   - `npx serve .` or `python -m http.server 8000`
   - Open [http://localhost:8000](http://localhost:8000).

### How to Test Between 2 Tabs:
1. Open [http://localhost/tvshare/](http://localhost/tvshare/) in Tab 1 (Host).
2. Click **"✨ Load Demo Synthwave Video"** (or select a local video from your disk).
3. Click **"Start Watch Party"**.
4. Click **"Share Room"** and copy the invite link.
5. Open an Incognito window or Tab 2 (Viewer) with the invite link.
6. Click **"Join Watch Party"**.
7. Both tabs are now synchronized in real time! Press play, pause, or skip +/- 5s in either tab to watch them synchronize instantly.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` or `K` | Synced Play / Pause |
| `Left Arrow` or `J` | Synced Skip Backward (-5s) |
| `Right Arrow` or `L` | Synced Skip Forward (+5s) |
| `F` | Toggle Fullscreen |
| `M` | Toggle Local Mute |
| `C` | Toggle Chat Drawer |

---

## 🛠️ Technology Stack

- **Signaling & P2P Streaming**: WebRTC + PeerJS (`MediaStream`, `RTCPeerConnection`, `RTCDataChannel`).
- **Audio Routing**: Web Audio API (`AudioContext`, `GainNode`, `MediaStreamAudioDestinationNode`).
- **Styling**: Vanilla CSS3 Custom Properties, Glassmorphism, CSS Grid & Flexbox, Ambient Canvas back-glow.
- **Typography**: Google Fonts (*Outfit*, *Plus Jakarta Sans*, *JetBrains Mono*).
- **Libraries**: Lightweight standalone vendor modules for PeerJS, Canvas Confetti, and QR Code generation.
