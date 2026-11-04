/**
 * @file test_camelot_wheel.ts
 * @description Verifies Camelot Wheel harmonic distance and BPM compatibility calculations.
 */

import { getHarmonicCompatibility, getBpmCompatibility, getCamelotCode } from '../src/utils/camelotWheel.js';

function run() {
  console.log('--- Testing Camelot Wheel & BPM Compatibility ---');

  // Test 1: Code conversion
  const cMaj = getCamelotCode(0, 'major'); // C major -> 8B
  const aMin = getCamelotCode(9, 'minor'); // A minor -> 8A
  console.log(`C major: ${cMaj} (Expected: 8B), A minor: ${aMin} (Expected: 8A)`);
  if (cMaj !== '8B' || aMin !== '8A') throw new Error('Camelot code mapping mismatch');

  // Test 2: Harmonic distance
  const matchExact = getHarmonicCompatibility('8A', '8A');
  const energyLift = getHarmonicCompatibility('8A', '9A');
  const relativeKey = getHarmonicCompatibility('8A', '8B');
  const dissonant = getHarmonicCompatibility('8A', '2A');

  console.log(`8A -> 8A (Exact): ${matchExact} (Expected: 1.0)`);
  console.log(`8A -> 9A (Energy lift): ${energyLift} (Expected: 0.85)`);
  console.log(`8A -> 8B (Relative): ${relativeKey} (Expected: 0.85)`);
  console.log(`8A -> 2A (Dissonant): ${dissonant} (Expected: <= 0.1)`);

  if (matchExact !== 1.0 || energyLift !== 0.85 || relativeKey !== 0.85 || dissonant > 0.1) {
    throw new Error('Harmonic compatibility calculation failed');
  }

  // Test 3: BPM compatibility
  const bpmClose = getBpmCompatibility(120, 123);
  const bpmDouble = getBpmCompatibility(70, 140);
  const bpmClash = getBpmCompatibility(80, 135);

  console.log(`120 -> 123 BPM: ${bpmClose} (Expected: 1.0)`);
  console.log(`70 -> 140 BPM (Double-time): ${bpmDouble} (Expected: 0.9)`);
  console.log(`80 -> 135 BPM (Clash): ${bpmClash} (Expected: 0.2)`);

  if (bpmClose !== 1.0 || bpmDouble !== 0.9 || bpmClash !== 0.2) {
    throw new Error('BPM compatibility calculation failed');
  }

  console.log('✅ Camelot Wheel & BPM tests passed!');
}

run();
