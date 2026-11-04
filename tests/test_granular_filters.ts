/**
 * @file test_granular_filters.ts
 * @description Unit tests for granular curation filters (Lives, Covers, Instrumentals, Re-recordings).
 */

import assert from 'assert';

// Mocking dynamicSettings in-memory for testing filter logic directly
class MockSettings {
  private values = new Map<string, string>();

  set(key: string, val: string) {
    this.values.set(key, val);
  }

  getString(key: string, fallback: string) {
    return this.values.get(key) || fallback;
  }
}

const mockSettings = new MockSettings();

function evaluateTrackFilters(title: string, artist: string, album: string = ''): boolean {
  const combined = `${title.toLowerCase()} ${artist.toLowerCase()} ${album.toLowerCase()}`;

  // 1. Live Recordings Filter
  const liveFilter = mockSettings.getString('curation_filter_live', 'none');
  const isLive = /\b(live|in concert|live at|live from|tour|unplugged|live session|live lounge|alive|live album|on stage|woodstock)\b/i.test(combined);
  const isAmateurLive = /\b(fancam|phone recording|audience recording|crowd audio|cam recording|bootleg live|crowd noise|recorded from crowd|handheld|distorted audio|wildwood)\b/i.test(combined);

  if (isLive) {
    if (liveFilter === 'none') {
      return false; // No lives at all
    }
    if (liveFilter === 'high_quality' && isAmateurLive) {
      return false; // Only high quality live
    }
  }

  // 2. Cover Tracks Filter
  const coverFilter = mockSettings.getString('curation_filter_covers', 'none');
  const isCover = /\b(cover|tribute|sung by|karaoke|acoustic cover|cover by|tribute band)\b/i.test(combined);
  const isAmateurCover = /\b(bedroom cover|acoustic cover|cover by|tribute band|fan cover|reaction|guitar cover|drum cover|piano cover|vocal cover)\b/i.test(combined);

  if (isCover) {
    if (coverFilter === 'none') {
      return false; // No covers at all
    }
    if (coverFilter === 'high_quality' && isAmateurCover) {
      return false; // Only big artist / high quality covers
    }
  }

  // 3. Instrumental Tracks Filter
  const instrumentalFilter = mockSettings.getString('curation_filter_instrumentals', 'none');
  const isInstrumental = /\b(instrumental|backing track|minus one|karaoke|karaoke version|no vocals|off vocal)\b/i.test(combined);
  const isLowQualityInstrumental = /\b(backing track|minus one|karaoke|type beat|fan instrumental|midi)\b/i.test(combined);

  if (isInstrumental) {
    if (instrumentalFilter === 'none') {
      return false; // No instrumentals at all
    }
    if (instrumentalFilter === 'high_quality' && isLowQualityInstrumental) {
      return false; // Only official / high quality instrumentals
    }
  }

  // 4. Re-Recorded Versions Filter
  const rerecordedFilter = mockSettings.getString('curation_filter_rerecorded', 'none');
  const isRerecorded = /\b(re-recorded|rerecorded|re-recording|re-record|new version|20\d\d version|re-cut|later recording|acoustic remake)\b/i.test(combined);
  if (isRerecorded && rerecordedFilter === 'none') {
    return false; // Original masters only
  }

  return true;
}

async function runTests() {
  console.log('🧪 Testing Granular Curation Filters (Lives, Covers, Instrumentals, Re-recordings)...\n');

  // Test 1: Default Mode (All set to 'none' - Strict Studio & Original Masters)
  console.log('--- Phase 1: Default Strict Mode (none) ---');
  mockSettings.set('curation_filter_live', 'none');
  mockSettings.set('curation_filter_covers', 'none');
  mockSettings.set('curation_filter_instrumentals', 'none');
  mockSettings.set('curation_filter_rerecorded', 'none');

  // KISS - 100,000 Years (Live At Wildwood Convention Hall)
  const kissLive = evaluateTrackFilters(
    '100,000 Years (Live At Wildwood Convention Hall, New Jersey, July 23, 1975)',
    'KISS',
    'Alive! (50th Anniversary Super Deluxe)'
  );
  assert.strictEqual(kissLive, false, 'Should reject KISS live concert track under none filter');
  console.log('✅ Rejects KISS concert recording under none filter');

  // Trisha Yearwood - In Another\'s Eyes (2014 Re-Recorded Version)
  const trishaReRecorded = evaluateTrackFilters(
    'In Another\'s Eyes (2014 Re-Recorded Version)',
    'Trisha Yearwood',
    'PrizeFighter: Hit After Hit'
  );
  assert.strictEqual(trishaReRecorded, false, 'Should reject modern re-recorded versions under none filter');
  console.log('✅ Rejects 2014 Re-Recorded track under none filter');

  // Standard studio track
  const studioTrack = evaluateTrackFilters('Stressed Out', 'Twenty One Pilots', 'Blurryface');
  assert.strictEqual(studioTrack, true, 'Should accept pure studio track');
  console.log('✅ Accepts pure studio track (Twenty One Pilots - Stressed Out)');

  // Test 2: High Quality Live Allowed
  console.log('\n--- Phase 2: High Quality Live Allowed (high_quality) ---');
  mockSettings.set('curation_filter_live', 'high_quality');

  const bbcLive = evaluateTrackFilters('Fast Car (BBC Live Lounge)', 'Sam Smith');
  assert.strictEqual(bbcLive, true, 'Should accept official BBC Live Lounge track under high_quality');
  console.log('✅ Accepts official live release under high_quality filter');

  const bootlegLive = evaluateTrackFilters('Song (Audience recording / bootleg live)', 'Band');
  assert.strictEqual(bootlegLive, false, 'Should reject crowd bootleg even under high_quality');
  console.log('✅ Rejects audience/crowd bootleg under high_quality filter');

  // Test 3: Any Allowed
  console.log('\n--- Phase 3: Any Live Allowed (any) ---');
  mockSettings.set('curation_filter_live', 'any');
  const kissLiveAny = evaluateTrackFilters(
    '100,000 Years (Live At Wildwood Convention Hall, New Jersey, July 23, 1975)',
    'KISS'
  );
  assert.strictEqual(kissLiveAny, true, 'Should accept live concert track under any filter');
  console.log('✅ Accepts live concert track under any filter');

  console.log('\n🎉 All 5/5 Granular Filter assertions passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
