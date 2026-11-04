/**
 * @file tasteRadar.ts
 * @description Autonomous Proactive Taste Radar & Catalog Expansion Subsystem.
 * Continuously crawls related artists, deep-cuts, and genre frontiers around active room preferences,
 * automatically generates dense 384-d latent vectors, and expands VEXO's catalog towards 50,000 tracks.
 */

import { sqlite } from '../db/index.js';
import config from '../config.js';
import deezer, { type DeezerTrackMetadata } from './deezer.js';
import vectorCurator from './vectorCurator.js';
import brainLogger from './brainLogger.js';
import dynamicSettings from './dynamicSettings.js';

export const TARGET_CATALOG_SIZE = 50_000;
const VECTOR_DIM = 384;

const UNWANTED_VARIANTS = [
  'live', 'karaoke', '8d', 'slowed', 'reverb', 'nightcore',
  'cover', 'instrumental', 'tribute', 'remake', 'parody',
  'bass boosted', 'mix', 'medley', 'podcast', 'acoustic',
  'reaction', 'lesson', 'tutorial', 'backing track'
];

function isVariantClean(title: string): boolean {
  const norm = title.toLowerCase();
  for (const word of UNWANTED_VARIANTS) {
    if (norm.includes(word)) return false;
  }
  return true;
}

function normalize(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1e-12;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

export class TasteRadar {
  private isRunning = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isCycleActive = false;
  private activeMemberIds: () => string[] = () => [];

  constructor() {
    this.ensureTables();
  }

  private ensureTables(): void {
    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS song_embeddings (
          song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
          vector BLOB NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    } catch (err) {
      console.warn('[TasteRadar] Error ensuring tables:', (err as Error).message);
    }
  }

  /**
   * Set callback to retrieve active listener IDs from GuildPlayer.
   */
  public setActiveListenersProvider(fn: () => string[]): void {
    this.activeMemberIds = fn;
  }

  /**
   * Start the continuous background taste radar.
   */
  public start(intervalMs?: number): void {
    if (this.isRunning) return;
    this.isRunning = true;
    const effectiveInterval = intervalMs || dynamicSettings.getNumber('radar_scan_interval_sec', 210) * 1000;
    const targetSize = dynamicSettings.getNumber('radar_target_catalog_size', TARGET_CATALOG_SIZE);
    console.log(`[TasteRadar] 🛰️ Autonomous Taste Radar started (target: ${targetSize.toLocaleString()} tracks, interval: ${Math.round(effectiveInterval / 1000)}s)`);

    // Listen to dynamic settings change
    dynamicSettings.on('change:radar_scan_interval_sec', (newSec: number) => {
      this.reschedule(newSec * 1000);
    });

    // Initial cycle after 30 seconds
    setTimeout(() => {
      this.runMiningCycle().catch((err) => {
        console.warn('[TasteRadar] Initial mining cycle error:', (err as Error).message);
      });
    }, 30_000);

    this.intervalTimer = setInterval(() => {
      this.runMiningCycle().catch((err) => {
        console.warn('[TasteRadar] Mining cycle error:', (err as Error).message);
      });
    }, effectiveInterval);
  }

  /**
   * Reschedules the active mining timer dynamically.
   */
  public reschedule(intervalMs: number): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (!this.isRunning) return;
    console.log(`[TasteRadar] 🛰️ Rescheduling mining interval to ${Math.round(intervalMs / 1000)}s`);
    this.intervalTimer = setInterval(() => {
      this.runMiningCycle().catch((err) => {
        console.warn('[TasteRadar] Mining cycle error:', (err as Error).message);
      });
    }, intervalMs);
  }

  /**
   * Stop the background taste radar.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    console.log('[TasteRadar] 🛰️ Autonomous Taste Radar stopped.');
  }

  /**
   * Get current total catalog counts.
   */
  public getCatalogStats(): { totalSongs: number; totalEmbeddings: number; target: number } {
    const target = dynamicSettings.getNumber('radar_target_catalog_size', TARGET_CATALOG_SIZE);
    try {
      const totalSongs = (sqlite.prepare('SELECT count(*) as c FROM songs').get() as any).c;
      const totalEmbeddings = (sqlite.prepare('SELECT count(*) as c FROM song_embeddings').get() as any).c;
      return { totalSongs, totalEmbeddings, target };
    } catch {
      return { totalSongs: 0, totalEmbeddings: 0, target };
    }
  }

  /**
   * Run a single autonomous taste expansion cycle.
   * Discovers 20-50 novel tracks around the room's tastes, embeds them, and reloads vector index.
   */
  public async runMiningCycle(batchTarget = 40): Promise<{ mined: number; total: number; seedArtist: string }> {
    if (this.isCycleActive) {
      return { mined: 0, total: this.getCatalogStats().totalSongs, seedArtist: 'busy' };
    }
    this.isCycleActive = true;
    const t0 = performance.now();

    try {
      const stats = this.getCatalogStats();
      const targetSize = dynamicSettings.getNumber('radar_target_catalog_size', TARGET_CATALOG_SIZE);
      if (stats.totalSongs >= targetSize) {
        console.log(`[TasteRadar] 🎯 Target catalog size reached (${stats.totalSongs.toLocaleString()} / ${targetSize.toLocaleString()}). Radar idling in maintenance mode.`);
        return { mined: 0, total: stats.totalSongs, seedArtist: 'target_reached' };
      }

      // Step 1: Select a Seed Artist from Active Listeners or Server Top Affinities
      const seed = this.selectSeedArtist();
      if (!seed) {
        return { mined: 0, total: stats.totalSongs, seedArtist: 'none' };
      }

      console.log(`[TasteRadar] 🛰️ Probing taste graph for seed artist: "${seed.name}" (affinity: ${seed.affinityScore.toFixed(1)})...`);

      // Step 2: Query Deezer for Artist & Related Artists Graph Walk
      const searchRes = await deezer.searchTracks(`artist:"${seed.name}"`, 1);
      const seedArtistId = searchRes[0]?.artistId;
      if (!seedArtistId) {
        return { mined: 0, total: stats.totalSongs, seedArtist: seed.name };
      }

      const relatedArtists = await deezer.getRelatedArtists(seedArtistId, 12);
      const artistsToExplore = [{ id: seedArtistId, name: seed.name }, ...relatedArtists];

      // Shuffle to promote diverse exploration
      for (let i = artistsToExplore.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [artistsToExplore[i], artistsToExplore[j]] = [artistsToExplore[j], artistsToExplore[i]];
      }

      const candidateTracks: DeezerTrackMetadata[] = [];
      const seenIds = new Set<string>();

      // Step 3: Extract Deep Cuts from Related Artists
      for (const a of artistsToExplore.slice(0, 5)) {
        await new Promise((r) => setTimeout(r, 600)); // Respectful API pacing
        try {
          const topTracks = await deezer.getArtistTopTracks(a.id, 40);
          // Pick deep cuts (ranks 4 through 35, skipping top 3 mainstream hits)
          const deepCuts = topTracks.slice(3, 35);
          for (const track of deepCuts) {
            if (
              track.durationSec >= 60 &&
              track.durationSec <= 600 &&
              isVariantClean(track.title) &&
              !seenIds.has(track.id)
            ) {
              seenIds.add(track.id);
              candidateTracks.push(track);
            }
          }
        } catch {}
      }

      if (candidateTracks.length === 0) {
        return { mined: 0, total: stats.totalSongs, seedArtist: seed.name };
      }

      // Step 4: Filter out tracks already in SQLite songs table
      const newTracks: DeezerTrackMetadata[] = [];
      const checkStmt = sqlite.prepare('SELECT 1 FROM songs WHERE id = ? OR (LOWER(title) = LOWER(?) AND LOWER(artist) = LOWER(?)) LIMIT 1');

      for (const track of candidateTracks) {
        const exists = checkStmt.get(track.id, track.title, track.artist);
        if (!exists) {
          newTracks.push(track);
        }
        if (newTracks.length >= batchTarget) break;
      }

      if (newTracks.length === 0) {
        console.log(`[TasteRadar] All candidate tracks for "${seed.name}" cluster already exist in catalog.`);
        return { mined: 0, total: stats.totalSongs, seedArtist: seed.name };
      }

      // Step 5: Batch Embed via Ollama /api/embed
      const inputs = newTracks.map((t) => {
        let desc = `${t.artist} - ${t.title}`;
        if (t.album) desc += ` [Album: ${t.album}]`;
        if (t.genre) desc += ` [Genre: ${t.genre}]`;
        return desc;
      });

      const embedRes = await fetch('http://127.0.0.1:11434/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'all-minilm',
          input: inputs,
        }),
      });

      if (!embedRes.ok) {
        throw new Error(`Ollama embed error: ${embedRes.status} ${embedRes.statusText}`);
      }

      const embedData = (await embedRes.json()) as any;
      if (!embedData.embeddings || embedData.embeddings.length !== newTracks.length) {
        throw new Error(`Embedding count mismatch: expected ${newTracks.length}, got ${embedData.embeddings?.length}`);
      }

      // Step 6: Atomic SQLite Transaction Insert into songs & song_embeddings
      const now = Math.floor(Date.now() / 1000);
      const insertSongStmt = sqlite.prepare(`
        INSERT OR IGNORE INTO songs (id, deezer_id, title, artist, album, duration_sec, artwork_url, artwork_thumb_url, release_year, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertVectorStmt = sqlite.prepare(`
        INSERT OR REPLACE INTO song_embeddings (song_id, vector, updated_at)
        VALUES (?, ?, ?)
      `);

      sqlite.transaction(() => {
        for (let i = 0; i < newTracks.length; i++) {
          const t = newTracks[i];
          insertSongStmt.run(
            t.id,
            t.deezerId,
            t.title,
            t.artist,
            t.album || null,
            t.durationSec,
            t.artworkUrl,
            t.artworkThumbUrl,
            t.releaseYear || null,
            now
          );

          const raw = new Float32Array(embedData.embeddings[i]);
          normalize(raw);
          const buf = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
          insertVectorStmt.run(t.id, buf, now);
        }
      })();

      // Step 7: Hot-Reload in-memory vector index so tracks are immediately searchable
      await vectorCurator.reload();

      const newStats = this.getCatalogStats();
      const elapsed = Math.round(performance.now() - t0);

      console.log(
        `[TasteRadar] 🚀 Mined and indexed ${newTracks.length} novel tracks around "${seed.name}" in ${elapsed}ms | Catalog: ${newStats.totalSongs.toLocaleString()} / ${TARGET_CATALOG_SIZE.toLocaleString()}`
      );

      // Log to brain telemetry
      brainLogger.logInteraction({
        timestamp: now,
        model: 'taste_radar',
        action: 'taste_radar',
        prompt: `Taste Radar Graph Walk: seed [${seed.name}], related artists probed: [${artistsToExplore.slice(0, 4).map((a) => a.name).join(', ')}]`,
        response: JSON.stringify({
          seedArtist: seed.name,
          affinityScore: seed.affinityScore,
          tracksMined: newTracks.length,
          catalogTotal: newStats.totalSongs,
          targetCatalog: TARGET_CATALOG_SIZE,
          durationMs: elapsed,
          sampleTracks: newTracks.slice(0, 5).map((t) => `${t.artist} - ${t.title}`),
        }, null, 2),
        durationMs: elapsed,
        status: 'success',
        metadata: {
          seedArtist: seed.name,
          minedCount: newTracks.length,
          catalogTotal: newStats.totalSongs,
        },
      });

      return { mined: newTracks.length, total: newStats.totalSongs, seedArtist: seed.name };
    } catch (err) {
      console.warn('[TasteRadar] Error in mining cycle:', (err as Error).message);
      return { mined: 0, total: this.getCatalogStats().totalSongs, seedArtist: 'error' };
    } finally {
      this.isCycleActive = false;
    }
  }

  /**
   * Intelligently selects a seed artist based on active listeners or server preferences.
   */
  private selectSeedArtist(): { name: string; affinityScore: number } | null {
    const activeIds = this.activeMemberIds();

    if (activeIds.length > 0) {
      const placeholders = activeIds.map(() => '?').join(',');
      const rows = sqlite.prepare(`
        SELECT display_name, target_key, SUM(affinity_score) as total_affinity
        FROM user_preferences
        WHERE user_id IN (${placeholders}) AND target_type = 'artist' AND affinity_score > 0
        GROUP BY target_key
        ORDER BY total_affinity DESC
        LIMIT 25
      `).all(...activeIds) as Array<{ display_name: string; target_key: string; total_affinity: number }>;

      if (rows.length > 0) {
        const picked = rows[Math.floor(Math.random() * rows.length)];
        return { name: picked.display_name || picked.target_key, affinityScore: picked.total_affinity };
      }
    }

    // Fallback: Global Server Top Affinities
    const globalRows = sqlite.prepare(`
      SELECT display_name, target_key, SUM(affinity_score) as total_affinity
      FROM user_preferences
      WHERE target_type = 'artist' AND affinity_score > 0
      GROUP BY target_key
      ORDER BY total_affinity DESC
      LIMIT 100
    `).all() as Array<{ display_name: string; target_key: string; total_affinity: number }>;

    if (globalRows.length > 0) {
      const picked = globalRows[Math.floor(Math.random() * globalRows.length)];
      return { name: picked.display_name || picked.target_key, affinityScore: picked.total_affinity };
    }

    return null;
  }
}

export const tasteRadar = new TasteRadar();
export default tasteRadar;
