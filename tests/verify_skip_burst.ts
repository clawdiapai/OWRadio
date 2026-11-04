/**
 * @file verify_skip_burst.ts
 * @description Comprehensive test suite verifying Multi-Deck Lookahead Pool (Decks B, C, D)
 * and Skip-Burst Protection in GuildPlayer & BroadcastTee.
 */

import { BroadcastTee, PCM_FRAME_SIZE } from '../src/player/BroadcastTee.js';
import { GuildPlayer } from '../src/player/GuildPlayer.js';
import { AudioTrack } from '../src/player/AudioTrack.js';

function createDummyTrack(id: string, title: string, artist: string): AudioTrack {
  const track = new AudioTrack({
    id,
    title,
    artist,
    durationSec: 180,
    requestedBy: 'test_user',
    isManualRequest: false,
  });
  // Assign dummy stream URLs to bypass network fetching in unit tests
  track.streamUrl = `https://example.com/stream_${id}.mp3`;
  return track;
}

async function runTests() {
  console.log('=====================================================');
  console.log('🧪 TESTING MULTI-DECK LOOKAHEAD & SKIP-BURST ENGINE');
  console.log('=====================================================\n');

  // -----------------------------------------------------------------
  // 1. Verify Multi-Deck Lookahead Pool in BroadcastTee
  // -----------------------------------------------------------------
  console.log('--- 1. Testing BroadcastTee Multi-Deck Lookahead Pool ---');
  const tee = new BroadcastTee();

  console.log(`MAX_STANDBY_DECKS constant: ${BroadcastTee.MAX_STANDBY_DECKS}`);
  if (BroadcastTee.MAX_STANDBY_DECKS !== 3) {
    throw new Error(`Expected MAX_STANDBY_DECKS to be 3, got ${BroadcastTee.MAX_STANDBY_DECKS}`);
  }

  const initialStatus = tee.getStandbyPoolStatus();
  console.log(`Initial standby pool size: ${initialStatus.length}`);
  if (initialStatus.length !== 0) {
    throw new Error('Expected initial standby pool to be empty');
  }

  // Check isStandbyReady on empty pool
  if (tee.isStandbyReady()) {
    throw new Error('isStandbyReady should return false on empty pool');
  }
  console.log('✅ Empty pool check passed');

  // -----------------------------------------------------------------
  // 2. Testing Skip Burst Mashing (< 550ms intervals) in GuildPlayer
  // -----------------------------------------------------------------
  console.log('\n--- 2. Testing Skip-Burst Rapid Mashing (< 550ms) in GuildPlayer ---');
  const player = new GuildPlayer();
  player.autoplayEnabled = false; // Disable autoplay to test precise queue control

  // Seed player with active track and a queue of 15 tracks
  const activeTrack = createDummyTrack('track_0', 'Initial Track 0', 'Artist 0');
  (player as any).currentTrack = activeTrack;
  activeTrack.startedAtUnix = Math.floor(Date.now() / 1000);

  const queueTracks: AudioTrack[] = [];
  for (let i = 1; i <= 15; i++) {
    const t = createDummyTrack(`track_${i}`, `Track ${i} Title`, `Artist ${i}`);
    queueTracks.push(t);
    (player as any).queue.push(t);
  }

  console.log(`Active track: "${player.currentTrack?.title}"`);
  console.log(`Queue depth before skip burst: ${(player as any).queue.length} tracks`);

  // Simulate user mashing skip 10 times with 50ms intervals!
  console.log('\n⚡ Simulating rapid skip burst (10 skips in 500ms)...');
  for (let s = 1; s <= 10; s++) {
    player.skip('mash_user');
    console.log(`   [Skip #${s}] Current track advanced to: "${player.currentTrack?.title}" | Remaining queue: ${(player as any).queue.length}`);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  // Verify that current track has advanced to track_10 instantly
  if (player.currentTrack?.id !== 'track_10') {
    throw new Error(`Expected current track to be track_10 after 10 skips, got ${player.currentTrack?.id}`);
  }
  console.log('✅ Immediate metadata advancement during skip burst passed!');

  // Verify that debounce timer is active
  if (!(player as any).skipBurstDebounceTimer) {
    throw new Error('Expected skipBurstDebounceTimer to be active during burst quiescence window');
  }
  console.log('✅ Skip burst debounce timer is active during mashing');

  // Wait 500ms for debounce timer to settle and fire
  console.log('⏳ Waiting 500ms for skip burst to settle...');
  await new Promise((resolve) => setTimeout(resolve, 550));

  if ((player as any).skipBurstDebounceTimer !== null) {
    throw new Error('Expected skipBurstDebounceTimer to be null after settling');
  }
  if ((player as any).skipBurstCount !== 0) {
    throw new Error('Expected skipBurstCount to reset to 0 after settling');
  }
  console.log(`✅ Skip burst settled cleanly on target: "${player.currentTrack?.title}"`);

  // -----------------------------------------------------------------
  // 3. Testing Normal Track-Surfing Skip (1.0s interval >= 550ms)
  // -----------------------------------------------------------------
  console.log('\n--- 3. Testing Normal Skips (1.0s interval) ---');
  const prevTrack = player.currentTrack?.id;
  await new Promise((resolve) => setTimeout(resolve, 600)); // wait > 550ms
  player.skip('normal_user');

  console.log(`After normal skip: "${player.currentTrack?.title}" (was "${prevTrack}")`);
  if ((player as any).skipBurstCount !== 0) {
    throw new Error('Normal skip should have skipBurstCount = 0');
  }
  console.log('✅ Normal track-surfing skip passed!');

  // Cleanup
  player.stop();
  tee.destroy();

  console.log('\n=====================================================');
  console.log('🎉 ALL MULTI-DECK & SKIP-BURST TESTS PASSED!');
  console.log('=====================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
