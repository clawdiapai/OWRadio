import { isTrackEligibleForAutoplay } from '../src/services/curator.js';
import { normalizeArtist, normalizeTrackTitle, getTrackDedupeKey, isDuplicateTrack } from '../src/utils/trackDedupe.js';

console.log('--- 1. Testing Title & Artist Normalization ---');

const songA = {
  title: 'Hey Boy Hey Girl',
  artist: 'The Chemical Brothers',
  id: 'yt_CLuLAL9-VIo',
};

const songB = {
  title: 'Hey Boy Hey Girl (Extended Version)',
  artist: 'The Chemical Brothers - Topic',
  id: 'yt_AqFD2ja-9Fs',
};

const songC = {
  title: 'Elektrobank',
  artist: 'The Chemical Brothers',
  id: 'yt_XYZ123',
};

const songD = {
  title: 'Block Rockin\' Beats',
  artist: 'The Chemical Brothers',
  id: 'yt_DEF456',
};

const isDup = isDuplicateTrack(songA, songB);
console.log(`Song A vs Song B isDuplicate: ${isDup}`);
if (!isDup) {
  console.error('FAIL: Extended Version should be recognized as duplicate of original!');
  process.exit(1);
}

console.log('\n--- 2. Testing In-Memory Vibe Batch Guardrails ---');

const queuedSongIds = new Set<string>();
const queuedArtists = new Set<string>();
const queuedDedupeKeys = new Set<string>();

// Seed with Song A currently playing
queuedSongIds.add(songA.id);
queuedArtists.add(songA.artist.toLowerCase());
queuedArtists.add(normalizeArtist(songA.artist).replace(/\s+/g, ''));
queuedDedupeKeys.add(getTrackDedupeKey(songA.title, songA.artist));

// Candidate 1: Song B (Extended Version) -> Must be rejected by dedupe key & artist
const candKeyB = getTrackDedupeKey(songB.title, songB.artist);
const candNormArtB = normalizeArtist(songB.artist).replace(/\s+/g, '');
const isSongBEligible =
  !queuedDedupeKeys.has(candKeyB) &&
  !queuedArtists.has(candNormArtB) &&
  isTrackEligibleForAutoplay(songB.id, songB.artist, queuedSongIds, queuedArtists, songB.title, queuedDedupeKeys);

console.log(`Song B (Extended Version) eligible after Song A: ${isSongBEligible} (Expected: false)`);
if (isSongBEligible) {
  console.error('FAIL: Song B should NOT be eligible when Song A is playing!');
  process.exit(1);
}

// Candidate 2: Song C (Different song by same artist) -> In vibe batch, artist diversity must block it
const candNormArtC = normalizeArtist(songC.artist).replace(/\s+/g, '');
const isSongCEligibleInVibeBatch = !queuedArtists.has(candNormArtC);
console.log(`Song C (Repeat artist in vibe) eligible: ${isSongCEligibleInVibeBatch} (Expected: false)`);
if (isSongCEligibleInVibeBatch) {
  console.error('FAIL: Song C should NOT be eligible in the same vibe batch due to artist repeat!');
  process.exit(1);
}

// Candidate 3: Song by a new artist (e.g. Fatboy Slim - Right Here, Right Now)
const songE = {
  title: 'Right Here, Right Now',
  artist: 'Fatboy Slim',
  id: 'yt_FBOY123',
};
const candKeyE = getTrackDedupeKey(songE.title, songE.artist);
const candNormArtE = normalizeArtist(songE.artist).replace(/\s+/g, '');
const isSongEEligible =
  !queuedDedupeKeys.has(candKeyE) &&
  !queuedArtists.has(candNormArtE) &&
  isTrackEligibleForAutoplay(songE.id, songE.artist, queuedSongIds, queuedArtists, songE.title, queuedDedupeKeys);

console.log(`Song E (Fatboy Slim) eligible: ${isSongEEligible} (Expected: true)`);
if (!isSongEEligible) {
  console.error('FAIL: Song E by new artist should be eligible!');
  process.exit(1);
}

console.log('\nAll Vibe anti-duplicate tests PASSED perfectly! 🎉');
