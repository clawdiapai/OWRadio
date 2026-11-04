/**
 * @file verify_stream.ts
 * @description Verification test for Deezer metadata extraction, candidate duration tolerance,
 * yt-dlp stream resolution, L2 SQLite caching, and zero-gap 512KB prewarming.
 */

import deezer from '../src/services/deezer.js';
import streamResolver from '../src/services/streamResolver.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function runTests(): Promise<void> {
  console.log('\n--- 1. Testing Deezer Track Search & Artwork Normalization ---');
  const tracks = await deezer.searchTracks('Daft Punk - Veridis Quo', 3);
  assert(tracks.length > 0, `Deezer search returned ${tracks.length} tracks`);

  const track = tracks[0];
  console.log(`Resolved track: "${track.title}" by "${track.artist}" (Duration: ${track.durationSec}s)`);
  assert(track.title.toLowerCase().includes('veridis quo'), `Track title contains "Veridis Quo"`);
  assert(track.artworkUrl.includes('1400x1400'), `Artwork URL is normalized to 1400x1400 (${track.artworkUrl})`);
  assert(track.artworkThumbUrl.includes('250x250'), `Artwork thumbnail is normalized to 250x250`);
  assert(track.durationSec > 0, `Track duration is positive (${track.durationSec}s)`);

  console.log('\n--- 2. Testing Multi-Tier Stream Resolution (yt-dlp) ---');
  const resolved = await streamResolver.resolveStream(track);
  assert(resolved !== null, 'StreamResolver successfully resolved audio stream');
  if (!resolved) return;

  console.log(`YouTube ID: ${resolved.youtubeId}`);
  console.log(`Stream Source: ${resolved.source}`);
  console.log(`Stream URL: ${resolved.streamUrl.slice(0, 80)}...`);
  assert(resolved.streamUrl.startsWith('http'), 'Stream URL is a valid HTTP(S) URL');

  console.log('\n--- 3. Testing L2 Cache Hit ---');
  const cached = await streamResolver.resolveStream(track);
  assert(cached !== null, 'L2 Cache hit succeeded');
  assert(cached?.source === 'cache', 'Source is confirmed as "cache" on secondary call');

  console.log('\n--- 4. Testing 512 KB Prewarm Buffer ---');
  // 1. YouTube watch URLs must safely return null (prewarm bypass)
  if (resolved.streamUrl.includes('youtube.com') || resolved.streamUrl.includes('youtu.be')) {
    const ytPrewarm = await streamResolver.prewarmStreamBuffer(resolved.streamUrl);
    assert(ytPrewarm === null, 'Prewarm buffer safely bypasses raw YouTube watch URL');
  }

  // 2. Direct audio URLs (Deezer preview) should successfully fetch prewarm buffer
  if (track.previewUrl) {
    const prewarmBuffer = await streamResolver.prewarmStreamBuffer(track.previewUrl);
    assert(prewarmBuffer !== null, 'Prewarm buffer fetch succeeded for direct audio URL');
    if (prewarmBuffer) {
      console.log(`Prewarmed bytes received: ${prewarmBuffer.length} bytes`);
      assert(prewarmBuffer.length > 10000, `Prewarm buffer has substantial audio data (>10KB)`);
    }
  }

  console.log('\n🎉 ALL STREAM RESOLVER TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
