/**
 * @file test_vip_promotion.ts
 * @description Unit tests for VIP Single Request Pre-buffer & Up Next Promotion.
 */

import { AudioTrack } from '../src/player/AudioTrack.js';
import { PlaylistBlender } from '../src/player/PlaylistBlender.js';

console.log('=== 1. Initial State: Playlist track at index 0 ===');
const playlistTrack1 = new AudioTrack({
  id: 'yt_blondie',
  title: 'Heart Of Glass',
  artist: 'Blondie',
  durationSec: 250,
  requestedBy: 'user_alice',
  isManualRequest: true,
  requestType: 'playlist',
  playlistTitle: 'YouTube Playlist (alice)',
});

const playlistTrack2 = new AudioTrack({
  id: 'yt_olivia',
  title: 'the cure',
  artist: 'Olivia Rodrigo',
  durationSec: 180,
  requestedBy: 'user_bob',
  isManualRequest: true,
  requestType: 'playlist',
  playlistTitle: 'YouTube Playlist (bob)',
});

let queue = [playlistTrack1, playlistTrack2];
console.log('Initial Queue:', queue.map((t) => `${t.title} [${t.requestType}]`));

console.log('\n=== 2. Single VIP Request Arrives: "Lemon Tree" ===');
const singleVipTrack = new AudioTrack({
  id: 'yt_fools_garden',
  title: 'Lemon Tree',
  artist: 'Fools Garden',
  durationSec: 195,
  requestedBy: 'user_charlie',
  isManualRequest: true,
  requestType: 'single',
});

// Step 1: Initial insertion at index 1 (safe while buffering)
queue = PlaylistBlender.insertSingleRequest(queue, singleVipTrack);
console.log('Queue upon insertion (index 1):', queue.map((t) => `${t.title} [${t.requestType}]`));

if (queue[0].title !== 'Heart Of Glass') {
  throw new Error(`Expected Heart Of Glass at index 0 initially, got ${queue[0].title}`);
}
if (queue[1].title !== 'Lemon Tree') {
  throw new Error(`Expected Lemon Tree at index 1 initially, got ${queue[1].title}`);
}
console.log('✅ Safely inserted at index 1 while pre-buffering in RAM!');

console.log('\n=== 3. Simulating Standby Deck Primed -> Promote to Up Next (index 0) ===');
// Promotion function mimicking GuildPlayer.attemptVipSinglePromotion
function simulatePromotion(q: AudioTrack[], track: AudioTrack): boolean {
  if (q.length <= 1 || q[0] === track) return false;
  if (q[0].requestType === 'single') return false; // Don't steal existing VIP's spot
  const idx = q.indexOf(track);
  if (idx <= 0) return false;

  q.splice(idx, 1);
  q.unshift(track);
  return true;
}

const promoted = simulatePromotion(queue, singleVipTrack);
console.log(`Promoted: ${promoted}`);
console.log('Queue after promotion:', queue.map((t) => `${t.title} [${t.requestType}]`));

if ((queue[0].title as string) !== 'Lemon Tree') {
  throw new Error(`Expected Lemon Tree to be promoted to index 0, got ${queue[0].title}`);
}
if ((queue[1].title as string) !== 'Heart Of Glass') {
  throw new Error(`Expected Heart Of Glass shifted to index 1, got ${queue[1].title}`);
}
console.log('✅ Lemon Tree successfully promoted to Up Next (index 0) ahead of playlist tracks!');

console.log('\n=== 4. Second VIP Single Request Arrives: "Bohemian Rhapsody" ===');
const secondVipTrack = new AudioTrack({
  id: 'yt_queen',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  durationSec: 354,
  requestedBy: 'user_dave',
  isManualRequest: true,
  requestType: 'single',
});

queue = PlaylistBlender.insertSingleRequest(queue, secondVipTrack);
console.log('Queue after Dave VIP insertion:', queue.map((t) => `${t.title} [${t.requestType}]`));

// Attempt to promote Dave: should NOT displace Charlie's Lemon Tree (already a VIP request at index 0)
const secondPromoted = simulatePromotion(queue, secondVipTrack);
console.log(`Second VIP Promoted to index 0: ${secondPromoted} (Expected: false)`);
if (secondPromoted) {
  throw new Error('Second VIP request should NOT displace existing VIP request at index 0');
}
if (queue[0].title !== 'Lemon Tree') {
  throw new Error(`Expected Lemon Tree to remain at index 0, got ${queue[0].title}`);
}
if (queue[1].title !== 'Bohemian Rhapsody') {
  throw new Error(`Expected Bohemian Rhapsody at index 1, got ${queue[1].title}`);
}
if (queue[2].title !== 'Heart Of Glass') {
  throw new Error(`Expected Heart Of Glass at index 2, got ${queue[2].title}`);
}
console.log('✅ Multiple VIP single requests queue in fair order without stealing each other\'s Up Next slot!');

console.log('\n🎉 ALL VIP PROMOTION TESTS PASSED SUCCESSFULLY!');
