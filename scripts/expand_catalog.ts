/**
 * @file expand_catalog.ts
 * @description Strategy B Initial Seed Burst: Rapid graph walk across server taste nodes
 * to expand the catalog from 10k towards 25k tracks.
 */

import { sqlite } from '../src/db/index.js';
import deezer, { type DeezerTrackMetadata } from '../src/services/deezer.js';
import vectorCurator from '../src/services/vectorCurator.js';

const TARGET = parseInt(process.argv[2] || '25000', 10);
const BATCH_SIZE = 50;

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

async function run() {
  console.log('=====================================================');
  console.log(`🛰️ STRATEGY B: CATALOG EXPANSION BURST (TARGET: ${TARGET.toLocaleString()})`);
  console.log('=====================================================\n');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS song_embeddings (
      song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
      vector BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  let currentCount = (sqlite.prepare('SELECT count(*) as c FROM songs').get() as any).c;
  let embeddingCount = (sqlite.prepare('SELECT count(*) as c FROM song_embeddings').get() as any).c;
  console.log(`Initial Catalog Status: ${currentCount.toLocaleString()} songs | ${embeddingCount.toLocaleString()} embedded`);

  if (currentCount >= TARGET) {
    console.log(`✅ Catalog already has ${currentCount.toLocaleString()} songs (target: ${TARGET.toLocaleString()}). Nothing to do!`);
    return;
  }

  // 1. Fetch top artists from user_preferences and history
  const topArtists = sqlite.prepare(`
    SELECT display_name, target_key, SUM(affinity_score) as score
    FROM user_preferences
    WHERE target_type = 'artist' AND affinity_score > 0
    GROUP BY target_key
    ORDER BY score DESC
    LIMIT 200
  `).all() as Array<{ display_name: string; target_key: string; score: number }>;

  console.log(`Loaded ${topArtists.length} top taste seed artists from database.`);

  const insertSongStmt = sqlite.prepare(`
    INSERT OR IGNORE INTO songs (id, deezer_id, title, artist, album, duration_sec, artwork_url, artwork_thumb_url, release_year, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVectorStmt = sqlite.prepare(`
    INSERT OR REPLACE INTO song_embeddings (song_id, vector, updated_at)
    VALUES (?, ?, ?)
  `);

  const checkSongStmt = sqlite.prepare(`
    SELECT 1 FROM songs WHERE id = ? OR (LOWER(title) = LOWER(?) AND LOWER(artist) = LOWER(?)) LIMIT 1
  `);

  let totalAddedThisRun = 0;
  const tGlobalStart = performance.now();
  let pendingTracks: DeezerTrackMetadata[] = [];

  const flushBatch = async () => {
    if (pendingTracks.length === 0) return;
    const chunk = pendingTracks.splice(0, pendingTracks.length);

    const inputs = chunk.map((t) => {
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
      console.error(`Ollama embed error: ${embedRes.status}`);
      return;
    }

    const embedData = (await embedRes.json()) as any;
    if (!embedData.embeddings || embedData.embeddings.length !== chunk.length) {
      console.error('Embed count mismatch');
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    sqlite.transaction(() => {
      for (let i = 0; i < chunk.length; i++) {
        const t = chunk[i];
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

    totalAddedThisRun += chunk.length;
    currentCount += chunk.length;
    const elapsedSec = (performance.now() - tGlobalStart) / 1000;
    const rate = (totalAddedThisRun / elapsedSec).toFixed(1);
    const pct = ((currentCount / TARGET) * 100).toFixed(1);
    console.log(
      `[Burst] Total: ${currentCount.toLocaleString()} / ${TARGET.toLocaleString()} (${pct}%) | Added: +${totalAddedThisRun.toLocaleString()} | Rate: ${rate} songs/sec`
    );
  };

  // Graph walk over artists
  for (const seed of topArtists) {
    if (currentCount >= TARGET) break;

    const artistName = seed.display_name || seed.target_key;
    try {
      const searchRes = await deezer.searchTracks(`artist:"${artistName}"`, 1);
      const seedId = searchRes[0]?.artistId;
      if (!seedId) continue;

      await new Promise((r) => setTimeout(r, 800)); // Polite pacing
      const related = await deezer.getRelatedArtists(seedId, 15);
      const cluster = [{ id: seedId, name: artistName }, ...related];

      for (const artistNode of cluster) {
        if (currentCount + pendingTracks.length >= TARGET) break;
        await new Promise((r) => setTimeout(r, 600));

        try {
          const topTracks = await deezer.getArtistTopTracks(artistNode.id, 45);
          const deepCuts = topTracks.slice(3, 35); // Filter top 3 mainstream hits

          for (const track of deepCuts) {
            if (track.durationSec < 60 || track.durationSec > 600) continue;
            if (!isVariantClean(track.title)) continue;

            const exists = checkSongStmt.get(track.id, track.title, track.artist);
            if (!exists) {
              pendingTracks.push(track);
            }

            if (pendingTracks.length >= BATCH_SIZE) {
              await flushBatch();
            }

            if (currentCount >= TARGET) break;
          }
        } catch {}
      }
    } catch (err) {
      console.warn(`Error probing "${artistName}":`, (err as Error).message);
    }
  }

  // Flush any remainder
  if (pendingTracks.length > 0) {
    await flushBatch();
  }

  console.log('\n=====================================================');
  console.log(`🎉 EXPANSION COMPLETE! Added ${totalAddedThisRun.toLocaleString()} songs.`);
  console.log(`Total Catalog Size: ${currentCount.toLocaleString()} songs.`);
  console.log('=====================================================');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
