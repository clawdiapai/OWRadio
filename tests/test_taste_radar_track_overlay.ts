/**
 * @file test_taste_radar_track_overlay.ts
 * @description Unit tests for Taste Radar Chart with Current Track Acoustic Overlay & Deltas.
 */

import tasteRadarChart from '../src/services/tasteRadarChart.js';
import featureFlags from '../src/services/featureFlags.js';

console.log('=== 1. Testing Room Fingerprint without Track (Baseline) ===');
const baseRoom = tasteRadarChart.getRoomFingerprint([]);
console.log(`Room Dimensions: ${baseRoom.dimensions.length}, Dominant: ${baseRoom.dominantArchetype}`);
if (baseRoom.dimensions.length !== 8) {
  throw new Error(`Expected 8 dimensions, got ${baseRoom.dimensions.length}`);
}
if (baseRoom.currentTrackFingerprint !== null && baseRoom.currentTrackFingerprint !== undefined) {
  throw new Error('Expected currentTrackFingerprint to be null when no track passed');
}
console.log('✅ Baseline room fingerprint test passed!');

console.log('=== 2. Testing Track Fingerprint & Acoustic Overlay ===');
const sampleTrack = {
  id: 'test_hiphop_01',
  title: 'HUMBLE.',
  artist: 'Kendrick Lamar',
  album: 'DAMN.',
  genre: 'Hip-Hop',
  durationSec: 177,
};

const roomWithTrack = tasteRadarChart.getRoomFingerprint([], sampleTrack);
if (!roomWithTrack.currentTrackFingerprint) {
  throw new Error('Expected currentTrackFingerprint to be present');
}

const trackFp = roomWithTrack.currentTrackFingerprint;
console.log(`Track: "${trackFp.title}" by "${trackFp.artist}"`);
console.log(`Dominant Genre: ${trackFp.dominantGenre}, BPM: ${trackFp.bpm}, Energy: ${trackFp.energyIndex}%`);
console.log(`Room Alignment Score: ${trackFp.alignmentScore}% Match`);

if (trackFp.dimensions.length !== 8) {
  throw new Error(`Expected 8 track dimensions, got ${trackFp.dimensions.length}`);
}

// Verify Hip-Hop score is boosted for Kendrick Lamar
const hiphopDim = trackFp.dimensions.find((d) => d.axis === 'hiphop');
if (!hiphopDim || hiphopDim.value < 60) {
  throw new Error(`Expected Hip-Hop score >= 60 for Kendrick Lamar, got ${hiphopDim?.value}`);
}
console.log(`Hip-Hop Score: ${hiphopDim.value}%, Room: ${hiphopDim.roomValue}%, Delta: ${hiphopDim.delta}%`);

// Verify all deltas are accurately computed: delta === value - roomValue
for (const d of trackFp.dimensions) {
  if (d.delta !== d.value - d.roomValue) {
    throw new Error(`Delta calculation mismatch for ${d.axis}: ${d.delta} !== ${d.value} - ${d.roomValue}`);
  }
}
console.log('✅ All 8 acoustic deltas verified mathematically!');

// Verify alignment score is valid
if (trackFp.alignmentScore < 30 || trackFp.alignmentScore > 100) {
  throw new Error(`Alignment score out of bounds: ${trackFp.alignmentScore}`);
}
console.log(`✅ Alignment score validated: ${trackFp.alignmentScore}%`);

console.log('=== 3. Testing Electronic / Dance Track Profile ===');
const electroTrack = {
  id: 'test_electro_01',
  title: 'Around the World',
  artist: 'Daft Punk',
  album: 'Homework',
  genre: 'Electronic Dance House',
  durationSec: 429,
};

const electroFp = tasteRadarChart.getTrackFingerprint(electroTrack, roomWithTrack.dimensions);
const electroDim = electroFp.dimensions.find((d) => d.axis === 'electronic');
if (!electroDim || electroDim.value < 65) {
  throw new Error(`Expected Electronic score >= 65 for Daft Punk, got ${electroDim?.value}`);
}
console.log(`Daft Punk Electronic Score: ${electroDim.value}%, Delta: ${electroDim.delta}%`);
console.log('✅ Electronic track profiling verified!');

console.log('=== 4. Testing ASCII Chart with Track Delta formatting ===');
console.log('ASCII Chart Output:');
console.log(roomWithTrack.asciiChart);

if (!roomWithTrack.asciiChart.includes('➔') || !roomWithTrack.asciiChart.includes('Δ')) {
  throw new Error('Expected asciiChart to contain comparison arrow and delta symbol');
}
console.log('✅ ASCII chart delta display verified!');

console.log('\n🎉 ALL TASTE RADAR TRACK OVERLAY & DELTA TESTS PASSED SUCCESSFULLY!');
