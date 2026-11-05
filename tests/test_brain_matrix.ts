import brainMatrix, { PILL_DEFINITIONS } from '../src/services/brainMatrix.js';
import { AudioTrack } from '../src/player/AudioTrack.js';

console.log('Testing Brain Matrix Telemetry Service...');

// 1. Verify 24 pills defined
console.log(`Defined pills count: ${PILL_DEFINITIONS.length}`);
if (PILL_DEFINITIONS.length !== 24) {
  throw new Error(`Expected 24 pill definitions, got ${PILL_DEFINITIONS.length}`);
}

// 2. Test idle state (no track)
const idlePills = brainMatrix.computeBrainPills(null, null, null, 0);
console.log(`Idle pills active count: ${idlePills.filter(p => p.active).length} (expected 0)`);
if (idlePills.some(p => p.active)) {
  throw new Error('Expected 0 active pills when player is idle');
}

// 3. Test active track curation
const mockTrack = new AudioTrack({
  id: 'dz_12345',
  title: 'One Day',
  artist: 'Bebe Rexha',
  durationSec: 188,
  requestedBy: 'autoplay_hybrid',
  isManualRequest: false,
  curatedBy: 'Dynamic Taste Deep-Cut',
  curationReason: 'Local Catalog: Unplayed Deep Discovery',
  bpm: 121,
  key: '8B',
  camelot: '8B',
});

const mockPrevTrack = new AudioTrack({
  id: 'dz_99999',
  title: 'Previous Jam',
  artist: 'Previous Band',
  durationSec: 200,
  requestedBy: 'autoplay',
  isManualRequest: false,
  curatedBy: 'Dynamic Taste Deep-Cut',
  bpm: 120,
  key: '8A',
  camelot: '8A',
});

const activePills = brainMatrix.computeBrainPills(mockTrack, mockPrevTrack, { isHarmonicMatch: true, reason: 'Compatible key transition: 3.5s crossfade' }, 4);
const activeCount = activePills.filter(p => p.active).length;
console.log(`Active track pills count: ${activeCount} / 24 active`);

const activeIds = activePills.filter(p => p.active).map(p => p.id);
console.log('Active pill IDs:', activeIds);

// Verify core expected pills are active
const expectedActive = ['catalog_vault', 'camelot_lock', 'cooldown_48h', 'artist_cooldown_2h', 'taste_radar', 'ebu_loudness'];
for (const id of expectedActive) {
  const pill = activePills.find(p => p.id === id);
  if (!pill || !pill.active) {
    throw new Error(`Expected pill ${id} to be ACTIVE for Bebe Rexha unplayed deep discovery`);
  }
}

// Verify dormant pills
const expectedDormant = ['user_request', 'qwen_llm', 'jev_decision'];
for (const id of expectedDormant) {
  const pill = activePills.find(p => p.id === id);
  if (!pill || pill.active) {
    throw new Error(`Expected pill ${id} to be DORMANT`);
  }
}

console.log('✅ Brain Matrix Telemetry Service passed all tests!');
