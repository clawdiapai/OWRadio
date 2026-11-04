import { AudioTrack } from '../src/player/AudioTrack.js';

const track = new AudioTrack({
  id: 'test_123',
  title: 'Starboy',
  artist: 'The Weeknd',
  durationSec: 230,
  requestedBy: 'user',
  isManualRequest: true,
});

console.log('Track BPM:', track.bpm);
console.log('Track Key:', track.key);
console.log('Track Camelot:', track.camelot);

const nowPlaying = track.toNowPlayingJson(50);
console.log('NowPlaying JSON:', {
  title: nowPlaying.title,
  artist: nowPlaying.artist,
  bpm: nowPlaying.bpm,
  key: nowPlaying.key,
  camelot: nowPlaying.camelot,
  elapsedSec: nowPlaying.elapsedSec,
  durationSec: nowPlaying.durationSec
});

if (typeof nowPlaying.bpm !== 'number' || !nowPlaying.key || !nowPlaying.camelot) {
  throw new Error('Harmonic cues missing from nowPlaying payload!');
}
console.log('✅ AudioTrack cues test passed successfully!');
