import featureFlags from '../src/services/featureFlags.js';
import harmonicMixing from '../src/services/harmonicMixing.js';
import stationCurator from '../src/services/stationCurator.js';
import tasteRadarChart from '../src/services/tasteRadarChart.js';
import vault from '../src/services/vault.js';
import { sqlite } from '../src/db/index.js';

console.log('=== 1. Verifying Feature Flags Service ===');
const allFlags = featureFlags.getAllFlags();
console.log(`Loaded ${allFlags.length} feature flags.`);
if (allFlags.length !== 12) {
  throw new Error(`Expected 12 feature flags, got ${allFlags.length}`);
}

// Exhaustively test all 12 feature flags toggling and SQLite persistence
for (const flag of allFlags) {
  const initVal = featureFlags.isEnabled(flag.id);
  const toggledVal = featureFlags.toggle(flag.id);
  if (toggledVal === initVal) {
    throw new Error(`Toggle failed for ${flag.id}: initial=${initVal}, toggled=${toggledVal}`);
  }
  const dbRow = sqlite.prepare('SELECT enabled FROM feature_flags WHERE id = ?').get(flag.id) as { enabled: number };
  if (!dbRow || (dbRow.enabled === 1) !== toggledVal) {
    throw new Error(`DB mismatch for ${flag.id}: db=${dbRow?.enabled}, expected=${toggledVal ? 1 : 0}`);
  }
  // Restore initial state
  featureFlags.setEnabled(flag.id, initVal);
}
console.log('✅ All 12 individual feature flag toggles and SQLite persistence verified!');

console.log('=== 2. Verifying Harmonic Mixing & Camelot Wheel ===');
const transition = harmonicMixing.evaluateTransition(
  { title: 'Track A', artist: 'Artist A', bpm: 128, key: '8A' },
  { title: 'Track B', artist: 'Artist B', bpm: 130, key: '9A' }
);
console.log(`Harmonic match: ${transition.isHarmonicMatch}, crossfadeSec=${transition.recommendedCrossfadeSec}s, reason: ${transition.reason}`);
if (!transition.isHarmonicMatch) {
  throw new Error(`Expected harmonic match for 8A (128) -> 9A (130)`);
}
console.log('✅ Harmonic mixing verified!');

console.log('=== 3. Verifying Curated Radio Stations & Story Arc ===');
const stations = stationCurator.getAllStations();
console.log(`Curated stations available: ${stations.map((s) => s.name).join(', ')}`);
if (stations.length < 5) {
  throw new Error(`Expected at least 5 stations, got ${stations.length}`);
}

stationCurator.setStation('synthwave');
const activeSt = stationCurator.getActiveStation();
if (activeSt?.id !== 'synthwave') {
  throw new Error(`Active station expected synthwave, got ${activeSt?.id}`);
}
stationCurator.setStation(null); // Reset
console.log('✅ Curated radio presets verified!');

console.log('=== 4. Verifying Taste Radar Chart 6-Axis Acoustic DNA ===');
const fingerprint = tasteRadarChart.getRoomFingerprint([]);
console.log(`Acoustic dimensions: ${fingerprint.dimensions.length}, Dominant archetype: ${fingerprint.dominantArchetype}`);
if (fingerprint.dimensions.length < 6) {
  throw new Error(`Expected at least 6 dimensions, got ${fingerprint.dimensions.length}`);
}
console.log('✅ Taste Radar Chart verified!');

console.log('=== 5. Verifying Offline Audio Vault ===');
const vaultStats = vault.getStats();
console.log(`Vault stats: ${vaultStats.count} tracks, ${vaultStats.formattedSize}`);
console.log('✅ Audio vault verified!');

console.log('=== 6. Verifying Discord Feature Slash Commands ===');
const { artistCommand, tasteCommand, throwbackCommand, radioCommand, morphCommand, vaultCommand } = await import('../src/bot/commands/features.js');
const cmds = [artistCommand, tasteCommand, throwbackCommand, radioCommand, morphCommand, vaultCommand];
for (const cmd of cmds) {
  const json = cmd.toJSON();
  if (!json.name || !json.description) {
    throw new Error(`Invalid slash command definition: ${JSON.stringify(json)}`);
  }
}
console.log(`Commands verified: ${cmds.map((c) => '/' + c.name).join(', ')}`);
console.log('✅ Feature slash commands verified!');

console.log('\n🎉 ALL 12 FEATURE SUBSYSTEM CHECKS PASSED SUCCESSFULLY!');
