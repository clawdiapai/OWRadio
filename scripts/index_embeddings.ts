import { sqlite } from '../src/db/index.js';

function normalize(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1e-12;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

export async function runEmbeddingIndexer(batchSize = 50): Promise<void> {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS song_embeddings (
      song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
      vector BLOB NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const totalSongs = (sqlite.prepare('SELECT count(*) as c FROM songs').get() as any).c;
  const alreadyDone = (sqlite.prepare('SELECT count(*) as c FROM song_embeddings').get() as any).c;
  console.log(`[VectorIndexer] Total songs in catalog: ${totalSongs} | Already indexed: ${alreadyDone}`);

  if (alreadyDone >= totalSongs) {
    console.log('[VectorIndexer] All songs are already embedded!');
    return;
  }

  const unindexed = sqlite.prepare(`
    SELECT id, title, artist, album, genre
    FROM songs
    WHERE id NOT IN (SELECT song_id FROM song_embeddings)
  `).all() as Array<{
    id: string;
    title: string;
    artist: string;
    album: string | null;
    genre: string | null;
  }>;

  console.log(`[VectorIndexer] Starting indexing for ${unindexed.length} songs in batches of ${batchSize}...`);

  const insertStmt = sqlite.prepare(`
    INSERT OR REPLACE INTO song_embeddings (song_id, vector, updated_at)
    VALUES (?, ?, ?)
  `);

  const tStart = performance.now();
  let processed = 0;

  for (let i = 0; i < unindexed.length; i += batchSize) {
    const chunk = unindexed.slice(i, i + batchSize);
    const inputs = chunk.map((s) => {
      let desc = `${s.artist} - ${s.title}`;
      if (s.album) desc += ` [Album: ${s.album}]`;
      if (s.genre) desc += ` [Genre: ${s.genre}]`;
      return desc;
    });

    try {
      const res = await fetch('http://127.0.0.1:11434/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'all-minilm',
          input: inputs,
        }),
      });

      if (!res.ok) {
        console.error(`[VectorIndexer] Ollama /api/embed error: ${res.status} ${res.statusText}`);
        break;
      }

      const data = (await res.json()) as any;
      if (!data.embeddings || data.embeddings.length !== chunk.length) {
        console.error(`[VectorIndexer] Embedding mismatch: expected ${chunk.length}, got ${data.embeddings?.length}`);
        break;
      }

      const now = Math.floor(Date.now() / 1000);
      sqlite.transaction(() => {
        for (let j = 0; j < chunk.length; j++) {
          const raw = new Float32Array(data.embeddings[j]);
          normalize(raw);
          const buf = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
          insertStmt.run(chunk[j].id, buf, now);
        }
      })();

      processed += chunk.length;
      if (processed % 250 === 0 || processed === unindexed.length) {
        const elapsed = (performance.now() - tStart) / 1000;
        const rate = (processed / elapsed).toFixed(1);
        const percent = (((alreadyDone + processed) / totalSongs) * 100).toFixed(1);
        console.log(`[VectorIndexer] Progress: ${alreadyDone + processed}/${totalSongs} (${percent}%) | Rate: ${rate} songs/sec`);
      }
    } catch (err) {
      console.error(`[VectorIndexer] Batch failed: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const totalTime = ((performance.now() - tStart) / 1000).toFixed(1);
  console.log(`[VectorIndexer] Finished indexing. Processed ${processed} songs in ${totalTime}s.`);
}

if (process.argv[1]?.endsWith('index_embeddings.ts') || process.argv[1]?.endsWith('index_embeddings.js')) {
  runEmbeddingIndexer().catch(console.error);
}
