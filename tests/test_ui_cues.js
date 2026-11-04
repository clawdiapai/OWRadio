import fs from 'fs';
import vm from 'vm';

const content = fs.readFileSync('src/web/public/app.js', 'utf8');
const elements = {};
const sandbox = {
  window: { addEventListener: () => {} },
  document: {
    getElementById: (id) => {
      if (!elements[id]) elements[id] = { id, innerText: '', style: {} };
      return elements[id];
    },
    addEventListener: () => {},
    querySelectorAll: () => []
  },
  navigator: {},
  location: { protocol: 'http:', host: 'localhost' },
  EventSource: class {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  setInterval: () => {},
  setTimeout: () => {},
  clearTimeout: () => {},
  requestAnimationFrame: () => {},
  console: console
};
sandbox.window.document = sandbox.document;
const ctx = vm.createContext(sandbox);
vm.runInContext(content, ctx);

// Case 1: Server sends track with bpm, key, camelot
vm.runInContext(`
  currentState = {
    state: 'playing',
    track: {
      id: 'test_123',
      title: 'Starboy',
      artist: 'The Weeknd',
      durationSec: 230,
      elapsedSec: 50,
      bpm: 124,
      key: 'CM',
      camelot: '5A'
    }
  };
  updateWaveformCues();
`, ctx);

console.log('--- Test 1: Full server payload ---');
console.log('BPM tag:', elements['waveform-bpm-tag']?.innerText);
console.log('Key tag:', elements['waveform-key-tag']?.innerText);
console.log('Drop tag:', elements['waveform-drop-tag']?.innerText);
console.log('Cue badge:', elements['waveform-cue-badge']?.innerText);

if (elements['waveform-bpm-tag']?.innerText !== 'BPM: ~124') {
  throw new Error('BPM tag mismatch');
}
if (elements['waveform-key-tag']?.innerText !== 'Key: CM (5A)') {
  throw new Error('Key tag mismatch');
}
if (!elements['waveform-drop-tag']?.innerText.includes('Drop / Cue: in 2:52')) {
  throw new Error('Drop tag mismatch');
}

// Case 2: Minimal fallback (no bpm, key, or camelot from server)
vm.runInContext(`
  currentState = {
    state: 'playing',
    track: {
      id: 'test_minimal',
      title: 'Get Lucky',
      artist: 'Daft Punk',
      durationSec: 248,
      elapsedSec: 242
    }
  };
  updateWaveformCues();
`, ctx);

console.log('--- Test 2: Fallback estimation (<8s left -> crossfade cue) ---');
console.log('BPM tag:', elements['waveform-bpm-tag']?.innerText);
console.log('Key tag:', elements['waveform-key-tag']?.innerText);
console.log('Drop tag:', elements['waveform-drop-tag']?.innerText);
console.log('Cue badge:', elements['waveform-cue-badge']?.innerText);

if (!elements['waveform-bpm-tag']?.innerText.startsWith('BPM: ~')) {
  throw new Error('Fallback BPM tag missing');
}
if (!elements['waveform-key-tag']?.innerText.startsWith('Key: ')) {
  throw new Error('Fallback Key tag missing');
}
if (elements['waveform-drop-tag']?.innerText !== 'Drop / Cue: in 6s') {
  throw new Error('Imminent Drop tag mismatch');
}
if (elements['waveform-cue-badge']?.innerText !== '⚡ CROSSFADE CUE') {
  throw new Error('Imminent Cue badge mismatch');
}

// Case 3: Idle / No track
vm.runInContext(`
  currentState = { state: 'idle', track: null };
  updateWaveformCues();
`, ctx);

console.log('--- Test 3: Idle state ---');
console.log('BPM tag:', elements['waveform-bpm-tag']?.innerText);
console.log('Key tag:', elements['waveform-key-tag']?.innerText);
console.log('Drop tag:', elements['waveform-drop-tag']?.innerText);
console.log('Cue badge:', elements['waveform-cue-badge']?.innerText);

if (elements['waveform-bpm-tag']?.innerText !== 'BPM: --') {
  throw new Error('Idle BPM tag mismatch');
}
if (elements['waveform-key-tag']?.innerText !== 'Key: --') {
  throw new Error('Idle Key tag mismatch');
}
if (elements['waveform-drop-tag']?.innerText !== 'Drop / Cue: --') {
  throw new Error('Idle Drop tag mismatch');
}
if (elements['waveform-cue-badge']?.innerText !== 'IDLE') {
  throw new Error('Idle Cue badge mismatch');
}

console.log('🎉 ALL CUES TESTS PASSED PERFECTLY!');
