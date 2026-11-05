import assert from 'node:assert';
import { sqlite } from '../src/db/index.js';
import dynamicSettings from '../src/services/dynamicSettings.js';
import { isTrackEligibleForAutoplay } from '../src/services/curator.js';
import { detectTrackLanguage } from '../src/services/languageDetector.js';

console.log('🧪 Running Foreign Language Cooldown Unit Tests...\n');

// 1. In-memory queue language rejection
{
  const queuedLangs = new Set<string>(['fr']);
  const isFrenchEligible = isTrackEligibleForAutoplay(
    'test_track_dadju',
    'Dadju',
    new Set(),
    new Set(),
    'Oublie-le',
    new Set(),
    180,
    queuedLangs
  );
  assert.strictEqual(isFrenchEligible, false, 'French track should be rejected when French is already queued');
  console.log('✅ In-memory queue: French track rejected when French already queued');

  const isEnglishEligible = isTrackEligibleForAutoplay(
    'test_track_en',
    'Coldplay',
    new Set(),
    new Set(),
    'Yellow',
    new Set(),
    180,
    queuedLangs
  );
  assert.strictEqual(isEnglishEligible, true, 'English track should remain eligible when French is queued');
  console.log('✅ In-memory queue: English track allowed when French is queued');
}

// 2. Playback history cooldown test
{
  const now = Math.floor(Date.now() / 1000);
  // Ensure tables exist in test db
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration_sec INTEGER
    );
    CREATE TABLE IF NOT EXISTS playback_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id TEXT,
      artist_name TEXT,
      played_at INTEGER,
      requested_by TEXT,
      is_manual_request INTEGER
    );
  `);

  // Insert a French song played 30 minutes ago
  const songId = 'aya_nakamura_comportement_' + now;
  sqlite.prepare(`
    INSERT OR REPLACE INTO songs (id, title, artist, duration_sec, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(songId, 'Comportement', 'Aya Nakamura', 200, now);

  sqlite.prepare(`
    INSERT INTO playback_history (song_id, artist_name, played_at, requested_by, is_manual_request)
    VALUES (?, ?, ?, ?, ?)
  `).run(songId, 'Aya Nakamura', now - 1800, 'test_user', 0);

  // Dynamic setting: 120 mins
  dynamicSettings.set('curation_language_cooldown_minutes', 120);

  // Now test Dadju (different artist, but French language)
  const isDadjuEligible = isTrackEligibleForAutoplay(
    'dadju_complique_' + now,
    'Dadju',
    new Set(),
    new Set(),
    'Compliqué',
    new Set(),
    190,
    new Set()
  );
  assert.strictEqual(isDadjuEligible, false, 'Dadju should be rejected due to French 120m cooldown');
  console.log('✅ History cooldown: Dadju (French) rejected within 120m cooldown window of Aya Nakamura (French)');

  // Under Station English Purity: Rosalía (Spanish) is ALSO blocked when ANY foreign track played recently
  const isRosaliaEligible = isTrackEligibleForAutoplay(
    'rosalia_despecha_' + now,
    'Rosalía',
    new Set(),
    new Set(),
    'Despechá',
    new Set(),
    150,
    new Set()
  );
  assert.strictEqual(isRosaliaEligible, false, 'Spanish track should also be rejected under station-wide English purity when French is on cooldown');
  console.log('✅ History cooldown: Rosalía (Spanish) blocked under station-wide English purity while French cooldown is active');

  // English track remains completely eligible
  const isColdplayEligible = isTrackEligibleForAutoplay(
    'coldplay_yellow_' + now,
    'Coldplay',
    new Set(),
    new Set(),
    'Yellow',
    new Set(),
    260,
    new Set()
  );
  assert.strictEqual(isColdplayEligible, true, 'English track must remain eligible');
  console.log('✅ English purity: Coldplay (English) remains 100% eligible during foreign cooldown');
}

console.log('\n🎉 All Foreign Language Cooldown Unit Tests Passed!\n');
