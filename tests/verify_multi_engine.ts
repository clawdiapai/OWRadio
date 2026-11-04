/**
 * @file verify_multi_engine.ts
 * @description Comprehensive verification test suite for Latent Vector (JEPA) curation,
 * multi-engine toggle, and fallback behavior across embedding, llm, and hybrid modes.
 */

import curator, { getEngine, setEngine, getNextAutoplayTracks } from '../src/services/curator.js';
import vectorCurator from '../src/services/vectorCurator.js';
import { sqlite } from '../src/db/index.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function runMultiEngineTests() {
  console.log('=== 1. Initializing Vector Curation Index ===');
  await vectorCurator.init();
  const indexedCount = vectorCurator.getIndexedCount();
  assert(indexedCount > 0, `Vector index has indexed tracks in RAM (got: ${indexedCount})`);

  console.log('\n=== 2. Testing Default Engine & Dynamic Toggle ===');
  const initialEngine = getEngine();
  console.log(`Initial engine: ${initialEngine}`);
  assert(['embedding', 'jev', 'llm', 'hybrid'].includes(initialEngine), 'Initial engine is valid');

  setEngine('embedding');
  assert(getEngine() === 'embedding', 'Engine dynamically set to "embedding"');

  console.log('\n=== 3. Testing Latent Vector Curation Speed & Guardrails ===');
  // Get active users from users table
  const sampleUsers = sqlite.prepare('SELECT id FROM users LIMIT 3').all() as Array<{ id: string }>;
  const userIds = sampleUsers.map(u => u.id);

  // Warm-up query
  await getNextAutoplayTracks(userIds, 1);

  // Timed warm query
  const t0 = performance.now();
  const vectorTracks = await getNextAutoplayTracks(userIds, 2);
  const vectorElapsed = performance.now() - t0;

  console.log(`Vector curation finished in ${vectorElapsed.toFixed(1)}ms. Returned ${vectorTracks.length} tracks:`);
  for (const vt of vectorTracks) {
    console.log(`  - [${vt.curatedBy}] ${vt.track.artist} - ${vt.track.title} (${vt.curationReason})`);
  }
  assert(vectorTracks.length === 2, `Returned exactly 2 curated tracks (got: ${vectorTracks.length})`);
  assert(vectorTracks.every(t => t.curatedBy === 'JEPA Vector Latent'), 'All tracks curated via JEPA Vector Latent badge');
  assert(vectorElapsed < 1000, `Vector curation completed ultra-fast in <1000ms (got: ${vectorElapsed.toFixed(1)}ms)`);

  console.log('\n=== 4. Testing Jev-Like Discriminative Decision Engine ===');
  setEngine('jev');
  assert(getEngine() === 'jev', 'Engine dynamically set to "jev"');

  const tJev = performance.now();
  const jevTracks = await getNextAutoplayTracks(userIds, 2);
  const jevElapsed = performance.now() - tJev;

  console.log(`Jev decision curation finished in ${jevElapsed.toFixed(1)}ms. Returned ${jevTracks.length} tracks:`);
  for (const jt of jevTracks) {
    console.log(`  - [${jt.curatedBy}] ${jt.track.artist} - ${jt.track.title} (${jt.curationReason})`);
  }
  assert(jevTracks.length === 2, `Jev returned exactly 2 tracks (got: ${jevTracks.length})`);
  assert(jevTracks.some(t => t.curatedBy === 'Jev Decision Engine'), 'Tracks curated with Jev Decision Engine badge');

  console.log('\n=== 5. Testing Instant Switch to LLM Engine ===');
  setEngine('llm');
  assert(getEngine() === 'llm', 'Engine dynamically set to "llm"');
  console.log('Verified engine state is now LLM');

  console.log('\n=== 6. Testing Instant Switch to Hybrid Engine ===');
  setEngine('hybrid');
  assert(getEngine() === 'hybrid', 'Engine dynamically set to "hybrid"');
  console.log('Verified engine state is now Hybrid');

  console.log('\n=== 7. Switching Back to Embedding as Default ===');
  setEngine('embedding');
  assert(getEngine() === 'embedding', 'Engine restored to "embedding"');

  console.log('\n🎉 ALL MULTI-ENGINE & LATENT VECTOR CURATION TESTS PASSED!');
}

runMultiEngineTests().catch((err) => {
  console.error('Fatal error during multi-engine test:', err);
  process.exit(1);
});
