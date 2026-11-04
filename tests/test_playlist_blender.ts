/**
 * @file test_playlist_blender.ts
 * @description Unit tests for PlaylistBlender multi-user interleaving and single request VIP priority.
 */

import { AudioTrack } from '../src/player/AudioTrack.js';
import { PlaylistBlender } from '../src/player/PlaylistBlender.js';
import dynamicSettings from '../src/services/dynamicSettings.js';

function createMockTrack(
  title: string,
  artist: string,
  requestedBy: string,
  isManual: boolean,
  requestType: 'single' | 'playlist' | 'autoplay',
  playlistId?: string
): AudioTrack {
  return new AudioTrack({
    id: `track_${title.toLowerCase().replace(/\s+/g, '_')}`,
    title,
    artist,
    durationSec: 180,
    requestedBy,
    isManualRequest: isManual,
    requestType,
    playlistId,
  });
}

function runTests() {
  console.log('--- TEST 1: Fair-Share Round-Robin Interleaving ---');
  dynamicSettings.set('curation_playlist_blend_mode', 'interleaved');
  dynamicSettings.set('curation_single_request_priority', true);

  // User A adds Playlist 1 (4 tracks)
  const tracksUserA = [
    createMockTrack('Song A1', 'Artist A', 'user_alice', true, 'playlist', 'pl_alice'),
    createMockTrack('Song A2', 'Artist A', 'user_alice', true, 'playlist', 'pl_alice'),
    createMockTrack('Song A3', 'Artist A', 'user_alice', true, 'playlist', 'pl_alice'),
    createMockTrack('Song A4', 'Artist A', 'user_alice', true, 'playlist', 'pl_alice'),
  ];

  let queue = PlaylistBlender.blendPlaylistBatch([], tracksUserA);
  console.log('Queue with Alice only:', queue.map(t => `${t.title} (${t.requestedBy})`));
  if (queue.length !== 4 || queue[0].title !== 'Song A1') {
    throw new Error('Test 1 failed on Alice initial queue');
  }

  // User B adds Playlist 2 (4 tracks)
  const tracksUserB = [
    createMockTrack('Song B1', 'Artist B', 'user_bob', true, 'playlist', 'pl_bob'),
    createMockTrack('Song B2', 'Artist B', 'user_bob', true, 'playlist', 'pl_bob'),
    createMockTrack('Song B3', 'Artist B', 'user_bob', true, 'playlist', 'pl_bob'),
    createMockTrack('Song B4', 'Artist B', 'user_bob', true, 'playlist', 'pl_bob'),
  ];

  queue = PlaylistBlender.blendPlaylistBatch(queue, tracksUserB);
  console.log('Queue after Bob joins (interleaved):', queue.map(t => `${t.title} (${t.requestedBy})`));

  // Head is Song A1 (Deck B protected).
  // Following tracks should interleave: A2, B1, A3, B2, A4, B3, B4
  if (queue[0].title !== 'Song A1') throw new Error(`Expected Song A1 at head, got ${queue[0].title}`);
  if (queue[1].title !== 'Song A2') throw new Error(`Expected Song A2 at idx 1, got ${queue[1].title}`);
  if (queue[2].title !== 'Song B1') throw new Error(`Expected Song B1 at idx 2, got ${queue[2].title}`);
  if (queue[3].title !== 'Song A3') throw new Error(`Expected Song A3 at idx 3, got ${queue[3].title}`);
  if (queue[4].title !== 'Song B2') throw new Error(`Expected Song B2 at idx 4, got ${queue[4].title}`);
  console.log('✅ TEST 1 PASSED: Playlists from Alice and Bob interleaved perfectly!');

  console.log('\n--- TEST 2: Single Song Request VIP Priority ---');
  // Charlie requests an individual song
  const charlieTrack = createMockTrack('Bohemian Rhapsody', 'Queen', 'user_charlie', true, 'single');
  queue = PlaylistBlender.insertSingleRequest(queue, charlieTrack);
  console.log('Queue after Charlie VIP request:', queue.map(t => `${t.title} (${t.requestedBy}, ${t.requestType})`));

  // Charlie should be at index 1 (right after head Song A1, ahead of Song A2 and Song B1!)
  if (queue[1].title !== 'Bohemian Rhapsody') {
    throw new Error(`Expected Bohemian Rhapsody at idx 1, got ${queue[1].title}`);
  }
  if (queue[1].requestedBy !== 'user_charlie') {
    throw new Error(`Expected user_charlie at idx 1, got ${queue[1].requestedBy}`);
  }
  console.log('✅ TEST 2 PASSED: Charlie single request jumped ahead of all playlist tracks!');

  console.log('\n--- TEST 3: Second Single Song Request Queueing Ahead of Playlists ---');
  // Dave requests an individual song
  const daveTrack = createMockTrack('Hotel California', 'Eagles', 'user_dave', true, 'single');
  queue = PlaylistBlender.insertSingleRequest(queue, daveTrack);
  console.log('Queue after Dave VIP request:', queue.map(t => `${t.title} (${t.requestedBy})`));

  // Head: Song A1
  // Idx 1: Bohemian Rhapsody (Charlie)
  // Idx 2: Hotel California (Dave)
  // Idx 3+: Playlist tracks
  if (queue[1].title !== 'Bohemian Rhapsody') throw new Error('Charlie track shifted unexpectedly');
  if (queue[2].title !== 'Hotel California') throw new Error(`Expected Dave track at idx 2, got ${queue[2].title}`);
  if (queue[3].title !== 'Song A2') throw new Error(`Expected Song A2 at idx 3, got ${queue[3].title}`);
  console.log('✅ TEST 3 PASSED: Dave single request queued right after Charlie and ahead of playlists!');

  console.log('\n--- TEST 4: Single Song Request With Autoplay Buffer ---');
  // When queue has only autoplay tracks:
  const autoplayQueue = [
    createMockTrack('Autoplay 1', 'Auto Artist', 'autoplay_llm', false, 'autoplay'),
    createMockTrack('Autoplay 2', 'Auto Artist', 'autoplay_llm', false, 'autoplay'),
  ];
  const eveSingle = createMockTrack('Imagine', 'John Lennon', 'user_eve', true, 'single');
  const resQueue = PlaylistBlender.insertSingleRequest(autoplayQueue, eveSingle);
  console.log('Autoplay queue after Eve single request:', resQueue.map(t => `${t.title} (${t.requestedBy})`));
  if (resQueue[0].title !== 'Imagine') {
    throw new Error(`Expected Imagine at idx 0 ahead of autoplay, got ${resQueue[0].title}`);
  }
  console.log('✅ TEST 4 PASSED: Single song replaces autoplay head immediately!');

  console.log('\n🎉 ALL PLAYLIST BLENDER TESTS PASSED!');
}

runTests();
