# ⚡ OWRadio — Open Web Radio & Discord Audio Engine

> High-fidelity, zero-latency 24/7 audio broadcast stream and Discord bot with dual-deck PCM playback, real-time live waveform visualization, autonomous AI curation, and a dark-mode web dashboard.
> **Optimized for self-hosting at $0.00 / month forever on Oracle Cloud Infrastructure (OCI) Always Free Tier.**

---

## 🌟 What is OWRadio?

OWRadio bridges professional internet radio broadcasting and Discord voice:

- **📻 24/7 Continuous Web Radio:** Broadcasts a constant, crystal-clear MP3 stream (`/stream.mp3`) accessible in web browsers, VLC, mobile media players, and IoT/ESP32 radios.
- **🎧 Studio Web Dashboard:** Dark-mode responsive web interface featuring public search, song request queueing, live queue management, and deep system telemetry.
- **⚡ Pro DJ Dual-Deck Audio Pipeline:** Pre-buffers upcoming tracks in RAM across dual PCM decks (`Deck A` + `Deck B`) for sub-second, click-free equal-power crossfades.
- **📊 Real-Time Audio Waveform:** Authentic dual-engine frequency spectrum (Web Audio API 60 FPS FFT in-browser + server-side 16-band PCM energy extraction for Discord listeners).
- **🤖 Autonomous AI DJ:** Powered by local Ollama models (`qwen2.5:1.5b` or `all-minilm` embeddings) that curate cohesive vibe mixes and map voice room musical taste.
- **🔐 Double Authentication System:** Granular security gate where **song search and `+ Queue` remain 100% public to all guests**, while skip, pause, stop, volume, and console settings are protected by an Admin Password or optional Supabase Google OAuth.
- **🌐 Standalone or Discord:** Operates with or without Discord. If `DISCORD_TOKEN` is unset, boots cleanly into standalone web radio mode.

---

## 🚀 Quick Start

### Option A: Autonomous AI Agent Setup (Recommended)
If you are using an AI coding assistant (such as **Antigravity**, **Cursor**, **Windsurf**, **Claude Code**, or **GitHub Copilot CLI**), simply point the agent to this repository!

The agent will read [`AGENTS.md`](./AGENTS.md) and guide you step-by-step:
1. Explain what OWRadio is and why 24/7 hosting is beneficial.
2. Help you claim an Oracle Cloud Always Free server (4 ARM64 cores, 24 GB RAM, 200 GB NVMe — **100% free forever**).
3. Set up passwordless SSH and autonomously deploy, configure, and verify the entire system for you.

---

### Option B: Run Locally on Your Computer

1. **Clone the repository:**
   ```bash
   git clone https://github.com/clawdiapai/OWRadio.git
   cd OWRadio
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your favorite text editor
   ```

4. **Start the server:**
   ```bash
   npm run dev
   ```

5. **Open in browser:**
   - Web Dashboard: [http://localhost:8091](http://localhost:8091)
   - Live MP3 Stream: [http://localhost:8091/stream.mp3](http://localhost:8091/stream.mp3)

---

### Option C: Manual Deployment on Oracle Cloud Free Tier

On your Ubuntu 22.04 / 24.04 ARM64 instance:

```bash
# 1. Clone repository
git clone https://github.com/clawdiapai/OWRadio.git /home/ubuntu/owradio
cd /home/ubuntu/owradio

# 2. Run the automated provisioning script (installs Node 22, ffmpeg, yt-dlp, Ollama, systemd)
chmod +x scripts/setup-oracle-vm.sh
./scripts/setup-oracle-vm.sh

# 3. Configure credentials
cp .env.example .env
nano .env

# 4. Build and start systemd service
npm install
npm run build
sudo systemctl restart owradio.service

# 5. Check logs
journalctl -u owradio.service -f
```

---

### Option D: Free HTTPS & Custom Domain (DuckDNS + Caddy)

To safely expose your station on the public internet with a free SSL certificate (green padlock) and clean URL:

1. Claim a free subdomain in 30 seconds on [duckdns.org](https://www.duckdns.org) (e.g. `mystation.duckdns.org`).
2. Run the automated Caddy reverse proxy setup script:
   ```bash
   chmod +x scripts/setup-caddy-duckdns.sh
   ./scripts/setup-caddy-duckdns.sh mystation <YOUR_DUCKDNS_TOKEN>
   ```
   *(For custom domains, run: `./scripts/setup-caddy-duckdns.sh radio.yourdomain.com`)*

Caddy will automatically request and install a Let's Encrypt TLS certificate, open ports 80/443, configure reverse proxying, and keep your dynamic IP updated every 5 minutes.
Visit your station securely at `https://mystation.duckdns.org`!

---

---

### Option E: Docker Deployment (Shared VPS / Existing Linux Servers)

If you are deploying OWRadio onto an existing server with shared web servers or other bots:

1. **Navigate to the container bundle:**
   `ash
   cd OWRADIO-DOCKER
   cp .env.example .env
   # Edit .env with your tokens
   `
2. **Build and start via Docker Compose:**
   `ash
   docker compose up -d --build
   `
3. See [OWRADIO-DOCKER/README.md](./OWRADIO-DOCKER/README.md) for full details, proxy mapping, and 1-click legacy rollback scripts.

---

## 🔒 Granular Security & Permissions

| Endpoint / Capability | Guest / Public | Admin Authenticated |
| :--- | :---: | :---: |
| **Listen to `/stream.mp3`** | ✅ Unlocked | ✅ Unlocked |
| **Search Deezer & YouTube** | ✅ Unlocked | ✅ Unlocked |
| **Add Song to Queue (`+ Queue`)** | ✅ Unlocked | ✅ Unlocked |
| **View Now Playing & Queue** | ✅ Unlocked | ✅ Unlocked |
| **Transport Controls (Skip, Pause, Stop, Volume)** | 🔒 Modal Prompt | ✅ Unlocked |
| **Clear or Reorder Queue** | 🔒 Modal Prompt | ✅ Unlocked |
| **Level 4 Console & AI Settings** | 🔒 Modal Prompt | ✅ Unlocked |

---

## 🧪 Test Suite

Run unit and integration verification tests:

```bash
npm run test:auth      # Verifies password hashing, HMAC sessions, and permission gates
npm run test:meter     # Verifies true PCM RMS and 16-band energy calculation
npm run test:curator   # Verifies 12 feature toggles, harmonic mixing, and taste radar
npm run build          # Full TypeScript compile check
```

---

---

## 🛡️ AI Agent Safety & Non-Destructive Deployment Guarantee

This repository includes [AGENTS.md](./AGENTS.md) — an operational standard for AI coding assistants (Antigravity, Cursor, Claude Code, Copilot, etc.). 

To protect end-user infrastructure, all AI assistants directed to this repository are bound by strict non-destructive safety guardrails:
1. **Zero Unconfirmed Deletions:** AI agents are forbidden from terminating cloud VMs, deleting boot volumes, or dropping existing databases without explicit, typed user confirmation.
2. **Preservation of Existing Workloads:** When deploying to shared servers or upgrading legacy bots, agents must deploy in isolated environments (such as Docker or dedicated subfolders) and maintain untouched backups of all configurations.
3. **Instant Rollback Requirement:** Automated deployments must include rollback mechanisms (e.g. 
ollback-to-legacy.sh) allowing users to instantaneously revert changes with zero downtime.
4. **Local Workspace Integrity:** Agents must not clobber user workstations or overwrite configuration templates without isolation.

---

## 📄 License

Distributed under the [MIT License](./package.json).
