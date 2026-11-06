import { AudioTrack } from '../src/player/AudioTrack.js';

// Case 1: Fresh track with no hints (unverified initially)
const unverifiedTrack = new AudioTrack({
  id: 'test_123',
  title: 'Starboy',
  artist: 'The Weeknd',
  durationSec: 230,
  requestedBy: 'user',
  isManualRequest: true,
});

console.log('Unverified Track BPM:', unverifiedTrack.bpm);
console.log('Unverified Track Key:', unverifiedTrack.key);

if (unverifiedTrack.bpm !== undefined || unverifiedTrack.key !== undefined) {
  throw new Error('Unverified track should not have synthetic fake numbers!');
}

// Case 2: DSP analysis updates track live
unverifiedTrack.bpm = 124;
unverifiedTrack.key = 'A minor';
unverifiedTrack.camelot = '8A';

const nowPlaying = unverifiedTrack.toNowPlayingJson(50);
console.log('NowPlaying JSON with genuine DSP data:', {
  title: nowPlaying.title,
  artist: nowPlaying.artist,
  bpm: nowPlaying.bpm,
  key: nowPlaying.key,
  camelot: nowPlaying.camelot,
  elapsedSec: nowPlaying.elapsedSec,
  durationSec: nowPlaying.durationSec
});

if (nowPlaying.bpm !== 124 || nowPlaying.key !== 'A minor' || nowPlaying.camelot !== '8A') {
  throw new Error('Harmonic cues missing from updated nowPlaying payload!');
}

// Case 3: Track created with verified hints
const hintedTrack = new AudioTrack({
  id: 'test_hinted',
  title: 'One More Time',
  artist: 'Daft Punk',
  durationSec: 320,
  requestedBy: 'user',
  isManualRequest: false,
  bpm: 123,
  key: 'D major',
  camelot: '10B',
});

if (hintedTrack.bpm !== 123 || hintedTrack.camelot !== '10B') {
  throw new Error('Hinted track properties were not set properly!');
}

console.log('✅ AudioTrack cues test passed successfully!');
