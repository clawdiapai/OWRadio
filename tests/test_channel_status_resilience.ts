/**
 * @file test_channel_status_resilience.ts
 * @description Unit tests verifying resilient voice channel status updating and clearing
 * when moving the bot between voice channels, handling manual moves by mods, and disconnects.
 */

import { GuildPlayer } from '../src/player/GuildPlayer.js';
import { AudioTrack } from '../src/player/AudioTrack.js';
import { getBotState } from '../src/db/index.js';

async function runTests() {
  console.log('🧪 Starting Channel Status Resilience Test Suite...\n');

  const player = new GuildPlayer();

  // Mock Discord Client REST API
  const restCalls: Array<{ route: string; body: any }> = [];
  const mockClient: any = {
    user: { id: 'bot-123', tag: 'OWRadio#0001' },
    rest: {
      put: async (route: string, options: any) => {
        restCalls.push({ route, body: options?.body });
        return {};
      },
    },
    channels: {
      fetch: async (id: string) => ({
        id,
        name: `Channel-${id}`,
        guild: { id: 'guild-123', voiceAdapterCreator: () => ({}) },
      }),
    },
  };

  player.setDiscordClient(mockClient);

  // 1. Test formatTrackStatus
  console.log('Test 1: formatTrackStatus formatting...');
  const testTrack = new AudioTrack({
    id: 'track-1',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    releaseYear: 1975,
    durationSec: 354,
    source: 'youtube',
    streamUrl: 'https://youtube.com/watch?v=mock',
  });

  const formatted = player.formatTrackStatus(testTrack);
  console.log(`  Formatted text: "${formatted}"`);
  if (formatted !== 'Queen - Bohemian Rhapsody - A Night at the Opera - 1975') {
    throw new Error(`Expected "Queen - Bohemian Rhapsody - A Night at the Opera - 1975", got "${formatted}"`);
  }
  console.log('  ✅ Track status text formatted correctly.');

  // 2. Test setVoiceChannelStatusOn and deduplication / rate-limit caching
  console.log('\nTest 2: setVoiceChannelStatusOn and duplicate suppression...');
  restCalls.length = 0;
  await player.setVoiceChannelStatusOn('channel-A', 'Queen - Bohemian Rhapsody');
  if (restCalls.length !== 1) {
    throw new Error(`Expected 1 REST call, got ${restCalls.length}`);
  }
  if (restCalls[0].body.status !== 'Queen - Bohemian Rhapsody') {
    throw new Error(`Expected status "Queen - Bohemian Rhapsody", got "${restCalls[0].body.status}"`);
  }

  // Duplicate call with exact same status on channel-A should be suppressed
  await player.setVoiceChannelStatusOn('channel-A', 'Queen - Bohemian Rhapsody');
  if (restCalls.length !== 1) {
    throw new Error(`Duplicate status call was NOT suppressed! REST calls: ${restCalls.length}`);
  }
  console.log('  ✅ Status set on channel-A and redundant duplicate calls suppressed.');

  // 3. Test clearVoiceChannelStatus
  console.log('\nTest 3: clearVoiceChannelStatus on channel-A...');
  await player.clearVoiceChannelStatus('channel-A');
  if (restCalls.length !== 2) {
    throw new Error(`Expected 2 REST calls after clear, got ${restCalls.length}`);
  }
  if (restCalls[1].body.status !== '') {
    throw new Error(`Expected empty status on clear, got "${restCalls[1].body.status}"`);
  }

  // Duplicate clear should be suppressed
  await player.clearVoiceChannelStatus('channel-A');
  if (restCalls.length !== 2) {
    throw new Error(`Duplicate clear call was NOT suppressed! REST calls: ${restCalls.length}`);
  }
  console.log('  ✅ Status cleared on channel-A and redundant clear calls suppressed.');

  // 4. Test handleBotVoiceStateUpdate when bot is moved by mods from Channel A to Channel B
  console.log('\nTest 4: handleBotVoiceStateUpdate (Moved from Channel A -> Channel B by a mod)...');
  restCalls.length = 0;
  player.currentTrack = testTrack;

  const mockChannelA: any = {
    id: 'channel-A',
    name: 'General Voice',
    guild: { id: 'guild-1', voiceAdapterCreator: () => ({}) },
    members: new Map(),
  };

  const mockChannelB: any = {
    id: 'channel-B',
    name: 'Music Lounge',
    guild: { id: 'guild-1', voiceAdapterCreator: () => ({}) },
    members: new Map(),
  };

  player.activeVoiceChannel = mockChannelA;

  // Simulate moderator moving bot to Channel B
  const oldState: any = {
    id: 'bot-123',
    channelId: 'channel-A',
    channel: mockChannelA,
  };
  const newState: any = {
    id: 'bot-123',
    channelId: 'channel-B',
    channel: mockChannelB,
  };

  await player.handleBotVoiceStateUpdate(oldState, newState);

  // Verification:
  // 1. Channel A status should have been cleared
  // 2. Channel B status should have been updated with current track
  // 3. player.activeVoiceChannel should be channel B
  // 4. botState last_voice_channel_id should be channel-B
  console.log(`  REST calls count: ${restCalls.length}`);
  for (const call of restCalls) {
    console.log(`    Route: ${call.route} -> body:`, JSON.stringify(call.body));
  }

  const clearCall = restCalls.find((c) => c.route.includes('channel-A'));
  const updateCall = restCalls.find((c) => c.route.includes('channel-B'));

  if (!clearCall || clearCall.body.status !== '') {
    throw new Error('Expected Channel A status to be cleared with empty string!');
  }
  if (!updateCall || updateCall.body.status !== 'Queen - Bohemian Rhapsody - A Night at the Opera - 1975') {
    throw new Error('Expected Channel B status to be set to track info!');
  }
  if (player.activeVoiceChannel?.id !== 'channel-B') {
    throw new Error(`Expected activeVoiceChannel to be channel-B, got ${player.activeVoiceChannel?.id}`);
  }
  if (getBotState('last_voice_channel_id') !== 'channel-B') {
    throw new Error(`Expected persisted last_voice_channel_id to be channel-B, got ${getBotState('last_voice_channel_id')}`);
  }
  console.log('  ✅ Old channel status deleted, new channel status written, active voice channel and state updated!');

  // 5. Test handleBotVoiceStateUpdate when bot is disconnected / kicked by a mod
  console.log('\nTest 5: handleBotVoiceStateUpdate (Bot disconnected/kicked from Channel B)...');
  restCalls.length = 0;

  const disconnectOldState: any = {
    id: 'bot-123',
    channelId: 'channel-B',
    channel: mockChannelB,
  };
  const disconnectNewState: any = {
    id: 'bot-123',
    channelId: null,
    channel: null,
  };

  await player.handleBotVoiceStateUpdate(disconnectOldState, disconnectNewState);

  const disconnectClearCall = restCalls.find((c) => c.route.includes('channel-B'));
  if (!disconnectClearCall || disconnectClearCall.body.status !== '') {
    throw new Error('Expected Channel B status to be cleared on disconnect!');
  }
  if (player.activeVoiceChannel !== null) {
    throw new Error(`Expected activeVoiceChannel to be null after disconnect, got ${player.activeVoiceChannel}`);
  }
  console.log('  ✅ Channel B status cleared and active voice channel set to null on disconnect.');

  // 6. Test no-op when bot voice state changes without channel change (e.g. server mute/deaf)
  console.log('\nTest 6: handleBotVoiceStateUpdate (No-op on mute/deaf toggle)...');
  restCalls.length = 0;
  const sameChannelState: any = {
    id: 'bot-123',
    channelId: 'channel-B',
    channel: mockChannelB,
  };
  await player.handleBotVoiceStateUpdate(sameChannelState, sameChannelState);
  if (restCalls.length !== 0) {
    throw new Error(`Expected 0 REST calls when channel didn't change, got ${restCalls.length}`);
  }
  console.log('  ✅ Non-channel voice state changes safely ignored.');

  console.log('\n🎉 ALL 6 CHANNEL STATUS RESILIENCE TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
