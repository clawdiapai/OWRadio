/**
 * @file test_audio_meter.ts
 * @description Unit tests for BroadcastTee Real-Time Audio Meter (RMS & 16-band Spectrum).
 */

import { BroadcastTee } from '../src/player/BroadcastTee.js';

console.log('=== 1. Verifying Audio Meter Initial Idle State ===');
const tee = new BroadcastTee();
const idleMeter = tee.getLiveAudioMeter();
console.log('Idle Meter:', idleMeter);

if (idleMeter.rms !== 0 || idleMeter.peak !== 0 || idleMeter.bands.length !== 16) {
  throw new Error(`Expected all zeros in idle meter, got: ${JSON.stringify(idleMeter)}`);
}
for (const b of idleMeter.bands) {
  if (b !== 0) throw new Error('Expected idle bands to be 0');
}
console.log('✅ Idle meter verification passed!');

console.log('\n=== 2. Simulating Synthesized PCM Frame Processing ===');
// Create a 20ms 48kHz stereo s16le PCM frame (3840 bytes = 960 stereo pairs)
// Fill with a 440Hz sine wave (A4 tone) at 50% amplitude
const frame = Buffer.alloc(3840);
const numSamples = 960;
const freq = 440;
const sampleRate = 48000;
const amplitude = 16384; // ~50% of 32767

for (let i = 0; i < numSamples; i++) {
  const sampleVal = Math.round(amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate));
  frame.writeInt16LE(sampleVal, i * 4);     // Left
  frame.writeInt16LE(sampleVal, i * 4 + 2); // Right
}

// Call private writePcmToBranches via prototype/any cast
(tee as any).isPlaying = true;
(tee as any).activeChannel = { id: 'mock', streamUrl: 'mock://test' };

// Feed 5 frames to let smoothing ramp up
for (let f = 0; f < 5; f++) {
  (tee as any).writePcmToBranches(frame);
}

const activeMeter = tee.getLiveAudioMeter();
console.log('Active Meter with 440Hz Sine Wave:', activeMeter);

if (activeMeter.rms <= 0.1 || activeMeter.rms > 1.0) {
  throw new Error(`Expected active RMS between 0.1 and 1.0, got ${activeMeter.rms}`);
}
if (activeMeter.peak <= 0.2 || activeMeter.peak > 1.0) {
  throw new Error(`Expected active peak between 0.2 and 1.0, got ${activeMeter.peak}`);
}
if (activeMeter.bands.length !== 16) {
  throw new Error(`Expected 16 spectrum bands, got ${activeMeter.bands.length}`);
}

const nonZeroBands = activeMeter.bands.filter((b) => b > 0);
if (nonZeroBands.length === 0) {
  throw new Error('Expected at least one non-zero frequency band during active audio');
}
console.log(`✅ Active audio analysis verified! (RMS: ${activeMeter.rms}, Peak: ${activeMeter.peak}, Active Bands: ${nonZeroBands.length}/16)`);

console.log('\n=== 3. Verifying Teardown & Silence Reset ===');
tee.stopDecoding(true);
const stoppedMeter = tee.getLiveAudioMeter();
console.log('Stopped Meter:', stoppedMeter);

if (stoppedMeter.rms !== 0 || stoppedMeter.peak !== 0) {
  throw new Error(`Expected zeroed meter after stopDecoding, got: ${JSON.stringify(stoppedMeter)}`);
}
console.log('✅ Teardown reset verified!');

console.log('\n🎉 ALL AUDIO METER & LIVE SPECTRUM TESTS PASSED SUCCESSFULLY!');
