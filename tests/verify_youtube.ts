/**
 * @file verify_youtube.ts
 * @description Comprehensive verification test suite for YouTube search, video extraction,
 * playlist extraction, direct stream resolution, and streamResolver integration.
 */

import youtube from '../src/services/youtube.js';
import streamResolver from '../src/services/streamResolver.js';
import { AudioTrack } from '../src/player/AudioTrack.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function run() {
  console.log('\n--- 1. Testing YouTube Freeform Search ---');
  const searchResults = await youtube.searchTracks('The Offspring Americana', 3);
  assert(searchResults.length > 0, `YouTube search returned ${searchResults.length} tracks`);
  const topResult = searchResults[0];
  console.log(`Top result: "${topResult.title}" by "${topResult.artist}" (Duration: ${topResult.durationSec}s, ID: ${topResult.videoId})`);
  assert(topResult.durationSec > 100 && topResult.durationSec < 300, `Track duration is studio length (${topResult.durationSec}s)`);
  assert(topResult.artworkUrl.startsWith('http'), 'Artwork URL is valid');

  console.log('\n--- 2. Testing YouTube Single Video Extraction ---');
  const singleVideo = await youtube.getTrack('F6_BSFHaCDU');
  assert(singleVideo !== null, 'Single video metadata retrieved successfully');
  if (singleVideo) {
    console.log(`Video: "${singleVideo.title}" by "${singleVideo.artist}" (${singleVideo.durationSec}s)`);
    assert(singleVideo.durationSec > 0, 'Duration is positive');
  }

  console.log('\n--- 3. Testing YouTube Playlist Extraction ---');
  // Popular public music playlist
  const playlistTracks = await youtube.getPlaylistTracks('PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj', 3);
  assert(playlistTracks.length > 0, `YouTube playlist returned ${playlistTracks.length} tracks`);
  for (const t of playlistTracks) {
    console.log(` - Playlist Track: "${t.title}" by "${t.artist}" (${t.durationSec}s, ID: ${t.videoId})`);
    assert(t.videoId.length > 0, 'Video ID is valid');
  }

  console.log('\n--- 4. Testing YouTube Audio Stream Extraction ---');
  const streamUrl = await youtube.getStreamUrl('F6_BSFHaCDU');
  assert(streamUrl !== null, 'YouTube audio stream URL extracted successfully');
  if (streamUrl) {
    console.log(`Audio Stream URL: ${streamUrl.slice(0, 80)}...`);
    assert(streamUrl.startsWith('http'), 'Stream URL is valid HTTP(S)');
  }

  console.log('\n--- 5. Testing StreamResolver Integration for YouTube Track ---');
  const ytTrack = AudioTrack.fromYouTube(topResult, 'test_user', true);
  const resolved = await streamResolver.resolveStream(ytTrack);
  assert(resolved !== null, 'StreamResolver resolved direct YouTube track');
  if (resolved) {
    console.log(`Resolved via source: "${resolved.source}" | Stream: ${resolved.streamUrl.slice(0, 80)}...`);
    assert(resolved.streamUrl.startsWith('http'), 'Resolved stream URL is valid');
  }

  console.log('\n🎉 ALL YOUTUBE VERIFICATION TESTS PASSED!\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
