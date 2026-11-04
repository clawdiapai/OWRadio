/**
 * @file test_collaborative_graph.ts
 * @description Verifies Deezer + Last.fm collaborative graph traversal and b-side mining.
 */

import collaborativeGraph from '../src/services/collaborativeGraph.js';

async function run() {
  console.log('--- Testing CollaborativeGraph (Deezer + Last.fm) ---');

  const seed = 'The Cure';
  console.log(`Querying related artists for: "${seed}"`);

  const t0 = performance.now();
  const related = await collaborativeGraph.getRelatedArtists(seed, 6);
  const elapsed = Math.round(performance.now() - t0);

  console.log(`Discovered ${related.length} related artists in ${elapsed}ms:`, related);

  if (related.length === 0) {
    throw new Error('No related artists returned');
  }

  const artistNames = related.slice(0, 3).map((r) => r.name);
  console.log(`Mining deep-cuts for: [${artistNames.join(', ')}]`);

  const deepCuts = await collaborativeGraph.getDeepCutsForArtists(artistNames, 3, 3);
  console.log(`Mined ${deepCuts.length} deep-cuts:`);
  for (const t of deepCuts) {
    console.log(` • ${t.artist} - ${t.title} (${t.durationSec}s)`);
    if (t.durationSec < 75 || t.durationSec > 480) {
      throw new Error(`Track duration ${t.durationSec}s violated 75s-480s bounds`);
    }
  }

  if (deepCuts.length === 0) {
    throw new Error('No deep-cuts returned');
  }

  console.log('✅ CollaborativeGraph test passed!');
}

run().catch((err) => {
  console.error('❌ CollaborativeGraph test failed:', err);
  process.exit(1);
});
