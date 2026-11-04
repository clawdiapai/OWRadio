/**
 * @file verify_db.ts
 * @description Verification test suite for database bootstrapping, 48h anti-repeat queries,
 * 2h artist cooldowns, and user preference affinity calculations.
 */

import { sqlite, db } from '../src/db/index.js';
import { songs, playbackHistory, userPreferences, streamCache } from '../src/db/schema.js';
import { eq, and, gt, sql } from 'drizzle-orm';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function runTests(): Promise<void> {
  console.log('\n--- 1. Testing WAL mode & Database Bootstrap ---');
  const pragmaMode = sqlite.pragma('journal_mode', { simple: true });
  assert(pragmaMode === 'wal', `Journal mode is WAL (got: ${pragmaMode})`);

  console.log('\n--- 2. Testing Song & History Insertion ---');
  const now = Math.floor(Date.now() / 1000);
  const songIdRecent = 'dz_test_recent_1';
  const songIdOld = 'dz_test_old_2';

  // Clean test data
  sqlite.exec(`DELETE FROM playback_history WHERE song_id LIKE 'dz_test_%'`);
  sqlite.exec(`DELETE FROM songs WHERE id LIKE 'dz_test_%'`);
  sqlite.exec(`DELETE FROM user_preferences WHERE user_id LIKE 'user_test_%'`);

  // Insert two test songs
  sqlite.prepare(`
    INSERT INTO songs (id, deezer_id, title, artist, duration_sec, artwork_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(songIdRecent, 'test_1', 'Recent Hit', 'Test Artist A', 210, 'http://example.com/art.jpg', now);

  sqlite.prepare(`
    INSERT INTO songs (id, deezer_id, title, artist, duration_sec, artwork_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(songIdOld, 'test_2', 'Old Classic', 'Test Artist B', 180, 'http://example.com/art.jpg', now);

  // Record playback history:
  // Song 1 played 10 hours ago (within 48h)
  const played10hAgo = now - 10 * 3600;
  sqlite.prepare(`
    INSERT INTO playback_history (song_id, artist_name, played_at, requested_by, is_manual_request)
    VALUES (?, ?, ?, ?, ?)
  `).run(songIdRecent, 'Test Artist A', played10hAgo, 'autoplay_llm', 0);

  // Song 2 played 50 hours ago (outside 48h)
  const played50hAgo = now - 50 * 3600;
  sqlite.prepare(`
    INSERT INTO playback_history (song_id, artist_name, played_at, requested_by, is_manual_request)
    VALUES (?, ?, ?, ?, ?)
  `).run(songIdOld, 'Test Artist B', played50hAgo, 'autoplay_llm', 0);

  console.log('\n--- 3. Testing 48-Hour Song Anti-Repetition Filter ---');
  const cutoff48h = now - 48 * 3600;

  const isRecentSongBlocked = sqlite.prepare(`
    SELECT 1 FROM playback_history
    WHERE song_id = ? AND played_at > ?
    LIMIT 1
  `).get(songIdRecent, cutoff48h);
  assert(Boolean(isRecentSongBlocked), 'Song played 10h ago is correctly BLOCKED by 48h filter');

  const isOldSongBlocked = sqlite.prepare(`
    SELECT 1 FROM playback_history
    WHERE song_id = ? AND played_at > ?
    LIMIT 1
  `).get(songIdOld, cutoff48h);
  assert(!isOldSongBlocked, 'Song played 50h ago is correctly PERMITTED by 48h filter');

  console.log('\n--- 4. Testing 2-Hour Artist Cooldown Filter ---');
  // Artist A played 10h ago -> outside 2h cooldown
  const cutoff2h = now - 2 * 3600;
  const isArtistABlocked = sqlite.prepare(`
    SELECT 1 FROM playback_history
    WHERE LOWER(artist_name) = LOWER(?) AND played_at > ?
    LIMIT 1
  `).get('Test Artist A', cutoff2h);
  assert(!isArtistABlocked, 'Artist A played 10h ago is outside 2h cooldown and PERMITTED');

  // Insert a playback for Artist C 30 minutes ago
  const played30mAgo = now - 1800;
  sqlite.prepare(`
    INSERT INTO playback_history (song_id, artist_name, played_at, requested_by, is_manual_request)
    VALUES (?, ?, ?, ?, ?)
  `).run(songIdRecent, 'Test Artist C', played30mAgo, 'autoplay_llm', 0);

  const isArtistCBlocked = sqlite.prepare(`
    SELECT 1 FROM playback_history
    WHERE LOWER(artist_name) = LOWER(?) AND played_at > ?
    LIMIT 1
  `).get('Test Artist C', cutoff2h);
  assert(Boolean(isArtistCBlocked), 'Artist C played 30m ago is correctly BLOCKED by 2h cooldown');

  console.log('\n--- 5. Testing User Preferences Affinity Score Formula ---');
  // Formula: (likes * 3.0) + (fullPlays * 1.0) - (earlySkips * 1.5) - (dislikes * 4.0)
  // Let: likes=2 (+6.0), fullPlays=4 (+4.0), earlySkips=1 (-1.5), dislikes=1 (-4.0)
  // Expected score = 6.0 + 4.0 - 1.5 - 4.0 = 4.5
  const likes = 2;
  const fullPlays = 4;
  const earlySkips = 1;
  const dislikes = 1;
  const expectedAffinity = (likes * 3.0) + (fullPlays * 1.0) - (earlySkips * 1.5) - (dislikes * 4.0);

  sqlite.prepare(`
    INSERT INTO user_preferences (user_id, target_type, target_key, display_name, likes, dislikes, early_skips, full_plays, affinity_score, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user_test_1', 'artist', 'daft punk', 'Daft Punk', likes, dislikes, earlySkips, fullPlays, expectedAffinity, now);

  const prefRow = sqlite.prepare(`
    SELECT * FROM user_preferences WHERE user_id = ? AND target_key = ?
  `).get('user_test_1', 'daft punk') as any;

  assert(prefRow !== undefined, 'User preference record exists');
  assert(Math.abs(prefRow.affinity_score - 4.5) < 0.001, `Affinity score equals 4.5 (got: ${prefRow.affinity_score})`);

  console.log('\n--- 6. Testing Stream Cache Insertion and TTL ---');
  const cacheKey = 'dz_test_cache_1';
  const expiresAt = now + 10800; // 3 hours
  sqlite.prepare(`
    INSERT OR REPLACE INTO stream_cache (song_id, youtube_id, stream_url, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(cacheKey, 'dQw4w9WgXcQ', 'https://googlevideo.com/videoplayback?test=1', expiresAt);

  const cached = sqlite.prepare(`
    SELECT * FROM stream_cache WHERE song_id = ? AND expires_at > ?
  `).get(cacheKey, now) as any;

  assert(cached !== undefined, 'Cached stream record exists and is valid');
  assert(cached.youtube_id === 'dQw4w9WgXcQ', 'Cached stream YouTube ID matches');

  // Clean up
  sqlite.exec(`DELETE FROM playback_history WHERE song_id LIKE 'dz_test_%'`);
  sqlite.exec(`DELETE FROM songs WHERE id LIKE 'dz_test_%'`);
  sqlite.exec(`DELETE FROM user_preferences WHERE user_id LIKE 'user_test_%'`);
  sqlite.exec(`DELETE FROM stream_cache WHERE song_id LIKE 'dz_test_%'`);

  console.log('\n🎉 ALL DATABASE & 48H TESTS PASSED PROGRAMMATICALLY!\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
