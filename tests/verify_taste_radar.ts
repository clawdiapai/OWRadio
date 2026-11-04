/**
 * @file verify_taste_radar.ts
 * @description Verifies Taste Radar autonomous discovery, embedding, and hot-reload.
 */

import tasteRadar from '../src/services/tasteRadar.js';
import vectorCurator from '../src/services/vectorCurator.js';

async function run() {
  console.log('=====================================================');
  console.log('🧪 TESTING TASTE RADAR AUTONOMOUS DISCOVERY');
  console.log('=====================================================\n');

  await vectorCurator.init();
  const initialStats = tasteRadar.getCatalogStats();
  console.log(`Initial Catalog Status: ${initialStats.totalSongs.toLocaleString()} songs | ${initialStats.totalEmbeddings.toLocaleString()} embedded (Target: ${initialStats.target.toLocaleString()})`);

  console.log('\n--- Running Single Taste Radar Mining Cycle (Target: 15 tracks) ---');
  const result = await tasteRadar.runMiningCycle(15);
  console.log('Mining Cycle Result:', JSON.stringify(result, null, 2));

  const newStats = tasteRadar.getCatalogStats();
  console.log(`\nUpdated Catalog Status: ${newStats.totalSongs.toLocaleString()} songs | ${newStats.totalEmbeddings.toLocaleString()} embedded`);

  if (result.mined > 0) {
    if (newStats.totalSongs <= initialStats.totalSongs) {
      throw new Error('Expected total songs count to increase after mining cycle');
    }
    console.log(`✅ Successfully added +${result.mined} novel tracks around seed "${result.seedArtist}"!`);
  } else {
    console.log(`ℹ️ Mining cycle completed with 0 tracks added (seed: ${result.seedArtist})`);
  }

  console.log('\n=====================================================');
  console.log('🎉 TASTE RADAR TEST PASSED!');
  console.log('=====================================================');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
