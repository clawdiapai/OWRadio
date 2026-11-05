# MUST.md — Core Directives & Hard Requirements

> **Document Status:** Active & Binding  
> **Repository:** `OWRadio` / `VEXO 2.0`  
> **Deployment Target:** `vexo` (`https://vexo.plingindigo.org`)  
> This file contains the non-negotiable rules, architectural decisions, and operational standards set by the user. Every agent and future code update **MUST** strictly adhere to these directives.

---

## 1. Core Operations & Performance

- [x] **24/7 Non-Stop Playback (Zero Dead-Air Guarantee):** The station must never halt playback unexpectedly. The autonomous watchdog must recover and resume instantly if playback drops or queues empty.
- [x] **Sub-Second Player Responsiveness:** Replaying, skipping, or selecting a new track must execute near-instantaneously (<1 second) using RAM pre-buffering (standby decks) rather than cold 15-second fetches.
- [x] **Production Domain Only:** All web studio links, embed URLs, and stream endpoints must point to `https://vexo.plingindigo.org` (never `127.0.0.1`, `localhost`, or internal container ports).
- [x] **Strict Git Workflow:** Every single change across `src/` and `OWRADIO-DOCKER/src/` **MUST** be committed and pushed to `origin/main` immediately.
- [x] **Container Synchronization:** The standalone codebase (`src/`) and isolated Docker container bundle (`OWRADIO-DOCKER/src/`) must remain in 100% synchronized parity at all times.

---

## 2. Discord Mini-Player & UI

- [x] **Ultra-Compact Footprint (<100px Height):** The Discord player embed must remain micro-sized so it does not monopolize the chat.
  - **Forbidden vertical bloat:** Do NOT show `NOW BROADCASTING`, volume percentages (`🔊 80%`), queue counters (`📋 Queue: 7`), active voice room dumps, system telemetry (RAM/standby decks), or static `Studio Guard` text.
- [x] **Strict Single-Row Controls (Exactly 4 Buttons):**
  - Row 1: `[⏮️ Replay]` `[⏸️ Pause]` `[⏭️ Skip]` `[⚙️ More...]`
  - No second or third row on the main embed.
- [x] **Ephemeral Modal for Secondary Tools:**
  - Clicking `[⚙️ More...]` opens a private (ephemeral) menu visible **only** to the user who clicked it.
  - Holds: `[👍 Like]`, `[👎 Dislike]`, `[✨ Vibe]`, `[🔀 Shuffle]`, `[📋 Queue]`, `[🎛️ Filter]`, `[🌐 Studio ↗]`, and `[❌ Close]`.
- [x] **Pin to Chat Bottom & Self-Cleaning:**
  - The player embed **MUST** always be the last message in the Discord channel.
  - When re-rendering or restarting, delete previous bot messages so only a single player card exists.
- [x] **Admin Channel Protection:** Only server admins/moderators can invoke the bot into a new voice or text channel to prevent channel hijacking.

---

## 3. Curation, Quality & Language Guardrails

- [x] **99.9% English Discovery & 24-Hour Global Foreign Cooldown:** Maximum 1 rare foreign song per 24 hours (1,440 min) across the entire station. Back-to-back foreign songs are strictly prohibited.
- [x] **Station DNA / Baseline Preferences (Editable in Web Studio):** Foundational seed scaffold (default artists: *Dua Lipa, Eminem, Metallica, Placebo, Muse, Ed Sheeran*; genres: *hip hop, pop, alt rock*) with mild 0.5 weight. Over time, user `/play` requests, likes, and dislikes naturally steer and overwrite this baseline.
- [x] **Lyrics-First NLP Language Classifier:** Language detection must prioritize actual song lyrics via LRCLIB + character trigrams/stopwords, backed by Last.fm crowdsourced tags and orthography heuristics (no naive title-only guesses).
- [x] **Strict Playback Cooldowns:**
  - **48-Hour Song Cooldown:** Never repeat the same track within 48 hours.
  - **2-Hour Artist Cooldown:** Never repeat the same artist within 2 hours.
- [x] **95% Official Releases (Quality Filters):**
  - Strictly filter out amateur covers, bad live bootlegs, karaoke, medleys, meme compilations, earrape, slowed+reverb, nightcore, and backing tracks.
  - Quality toggles supported across the board: `Lives` (none / high_quality / any), `Covers` (none / high_quality / any), `Instrumentals` (none / high_quality / any), `Remixes` (none / high_quality / any).
- [x] **Dislike ≠ Skip:** Clicking `Dislike` records negative taste affinity for learning; it does **NOT** interrupt or skip the currently playing song. Skipping is handled exclusively by `Skip`.

---

## 4. Catalog Expansion & Anti-Junk Safety (TasteRadar)

- [x] **Exact Artist Lookup Only:** When probing artist graphs, query Deezer's `/search/artist` endpoint with exact name matching (`deezer.searchArtist()`). Never use loose fuzzy track searches that match substrings.
- [x] **3,000+ Fan Count Gatekeeper:** Probed related artists **MUST** have at least 3,000 fans (`nb_fan >= 3000`) on Deezer. Never ingest obscure garage bands, marching bands, or local noise (e.g., *New Tocados* incident).
- [x] **Pre-Ingestion Language Verification:** Candidate deep-cuts harvested from the web must pass English language verification before being saved into SQLite.
- [x] **Autonomous 50k Catalog Turnover:** Expand the catalog up to 50,000 tracks via background harvesting. When approaching capacity, prune low-retention, zero-engagement, or disliked tracks.
- [x] **Unconditional Protection of Favorites:** User likes (`likes > 0`) and manual requests are permanently protected from automated catalog pruning.

---

## 5. Web Studio & Control Subsystem

- [x] **Interactive Playlist Skipping:** Authenticated users in the Web Studio can click any track in the queue/playlist to skip directly to it without multi-step delay.
- [x] **Admin Queue Management:** Admins have the ability to pop/remove unwanted tracks from the queue on demand.
- [x] **Granular Veto Management:** Provide a dedicated sub-view to easily view, add, and pop/remove vetoed artists and specific tracks.
- [x] **Preferences Wipe Security:** Wiping preferences or resetting taste models requires explicit double-confirmation with the Admin Password.
- [x] **Bi-Directional State Synchronization:** Web dashboard and Discord controls must remain in instant real-time sync without state discrepancies.
