import { audioDsp, AudioDspAnalyzer } from '../src/utils/audioDsp.js';

console.log('🧪 Starting Audio DSP Analyzer Test Suite...');

// 1. Test Silent / Underfilled Buffer
const silentBuffer = Buffer.alloc(48000 * 2 * 2 * 4); // 4 seconds of silence
const silentResult = audioDsp.analyzePcm(silentBuffer, 120);
console.log('Silence Analysis Result:', silentResult);

if (silentResult.isReliable || silentResult.bpm !== undefined || silentResult.camelot !== undefined) {
  throw new Error('DSP should NOT invent BPM or Key for silent/empty buffer!');
}
console.log('✅ Silence rejection passed');

// 2. Test Synthetic 120 BPM Beat Train
// 48kHz, 16-bit stereo = 48000 * 4 bytes per sec.
// 120 BPM = 2 beats/sec = 1 beat every 24000 samples (0.5s).
const sampleRate = 48000;
const durationSec = 6;
const totalSamples = sampleRate * durationSec;
const beatBuffer = Buffer.alloc(totalSamples * 4);

for (let s = 0; s < totalSamples; s++) {
  // Beat occurs every 24,000 samples (0.5 sec -> 120 BPM)
  const distFromBeat = s % 24000;
  let sampleVal = 0;
  
  if (distFromBeat < 2400) { // 50ms burst
    const decay = 1.0 - (distFromBeat / 2400);
    const freq = 80; // 80Hz bass kick
    sampleVal = Math.sin((2 * Math.PI * freq * s) / sampleRate) * decay * 25000;
  }

  const intVal = Math.max(-32768, Math.min(32767, Math.round(sampleVal)));
  beatBuffer.writeInt16LE(intVal, s * 4);     // Left
  beatBuffer.writeInt16LE(intVal, s * 4 + 2); // Right
}

const bpmResult = audioDsp.analyzePcm(beatBuffer, 180);
console.log('120 BPM Synthetic Beat Result:', {
  bpm: bpmResult.bpm,
  confidence: bpmResult.bpmConfidence,
  isReliable: bpmResult.isReliable,
  outroCueSec: bpmResult.outroCueSec,
});

if (!bpmResult.bpm || Math.abs(bpmResult.bpm - 120) > 3) {
  throw new Error(`Expected BPM around 120, got: ${bpmResult.bpm}`);
}
console.log('✅ Genuine BPM detection passed (~120 BPM detected)');

// 3. Test Synthetic A minor chord (A4 = 440Hz, C5 = 523.25Hz, E5 = 659.25Hz)
const chordBuffer = Buffer.alloc(totalSamples * 4);
for (let s = 0; s < totalSamples; s++) {
  // A minor chord
  const sA = Math.sin((2 * Math.PI * 440 * s) / sampleRate);
  const sC = Math.sin((2 * Math.PI * 523.25 * s) / sampleRate);
  const sE = Math.sin((2 * Math.PI * 659.25 * s) / sampleRate);
  const combined = ((sA + sC + sE) / 3) * 20000;
  const intVal = Math.max(-32768, Math.min(32767, Math.round(combined)));
  chordBuffer.writeInt16LE(intVal, s * 4);
  chordBuffer.writeInt16LE(intVal, s * 4 + 2);
}

const keyResult = audioDsp.analyzePcm(chordBuffer, 200);
console.log('A minor Synthetic Chord Result:', {
  key: keyResult.key,
  camelot: keyResult.camelot,
  confidence: keyResult.keyConfidence,
  isReliable: keyResult.isReliable,
});

// A minor is 8A (or relative major C major is 8B)
if (keyResult.camelot !== '8A' && keyResult.camelot !== '8B') {
  throw new Error(`Expected Camelot 8A (A minor) or 8B (C major), got: ${keyResult.camelot} (${keyResult.key})`);
}
console.log(`✅ Genuine Key detection passed (${keyResult.key} -> Camelot ${keyResult.camelot})`);

console.log('🎉 All Audio DSP unit tests passed successfully!');
