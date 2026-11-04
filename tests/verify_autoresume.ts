/**
 * @file verify_autoresume.ts
 * @description Verification test for auto-resume database persistence,
 * state hydration, and player auto-resume capabilities.
 */

import { sqlite, getBotState, setBotState } from '../src/db/index.js';
import { GuildPlayer } from '../src/player/GuildPlayer.js';
import vectorCurator from '../src/services/vectorCurator.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function runTests() {
  console.log('=== 1. Testing bot_state Table Persistence ===');
  setBotState('last_guild_id', '1058541244365668372');
  setBotState('last_voice_channel_id', '1063852037315514469');
  setBotState('last_voice_channel_name', '🗣︱Private 18+');
  setBotState('was_playing', '1');

  assert(getBotState('last_guild_id') === '1058541244365668372', 'last_guild_id retrieved correctly');
  assert(getBotState('last_voice_channel_id') === '1063852037315514469', 'last_voice_channel_id retrieved correctly');
  assert(getBotState('last_voice_channel_name') === '🗣︱Private 18+', 'last_voice_channel_name retrieved correctly');
  assert(getBotState('was_playing') === '1', 'was_playing flag retrieved correctly');

  console.log('\n=== 2. Testing Player Auto-Resume Playback Method ===');
  await vectorCurator.init();
  const player = new GuildPlayer();

  // Initially empty
  assert(player.currentTrack === null, 'Player initially has no current track');
  assert(player.getQueueList().length === 0, 'Player initially has empty queue');

  // Trigger autoResumePlayback()
  console.log('Triggering player.autoResumePlayback()...');
  const started = await player.autoResumePlayback();
  assert(started === true, 'autoResumePlayback() returned true');
  assert(player.currentTrack !== null, `Current track is active: "${player.currentTrack?.title}"`);
  assert(player.getQueueList().length > 0, `Autoplay buffer replenished (count: ${player.getQueueList().length})`);

  // Verify that playback state was written to bot_state
  assert(getBotState('was_playing') === '1', 'bot_state was_playing updated to 1');
  assert(getBotState('last_track_id') === player.currentTrack?.id, 'bot_state last_track_id recorded');

  player.stop();
  player.broadcastTee.destroy();

  console.log('\n🎉 ALL AUTO-RESUME TESTS PROGRAMMATICALLY PASSED!');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
