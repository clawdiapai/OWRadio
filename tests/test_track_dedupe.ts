import { normalizeArtist, normalizeTrackTitle, getTrackDedupeKey, isDuplicateTrack, isSameArtist } from '../src/utils/trackDedupe.js';

const tests = [
  {
    a: { title: 'Hey Boy Hey Girl', artist: 'The Chemical Brothers' },
    b: { title: 'Hey Boy Hey Girl (Extended Version)', artist: 'The Chemical Brothers - Topic' },
    expectedDuplicate: true,
  },
  {
    a: { title: 'Hey Boy Hey Girl', artist: 'The Chemical Brothers' },
    b: { title: 'The Chemical Brothers - Hey Boy Hey Girl (Official Music Video)', artist: 'TheChemicalBrothersVEVO' },
    expectedDuplicate: true,
  },
  {
    a: { title: 'Hey Boy Hey Girl', artist: 'The Chemical Brothers' },
    b: { title: 'Hey Boy Hey Girl - 2011 Remaster', artist: 'The Chemical Brothers' },
    expectedDuplicate: true,
  },
  {
    a: { title: 'Elektrobank', artist: 'The Chemical Brothers' },
    b: { title: 'Hey Boy Hey Girl', artist: 'The Chemical Brothers' },
    expectedDuplicate: false,
    expectedSameArtist: true,
  },
  {
    a: { title: 'Let Forever Be', artist: 'The Chemical Brothers' },
    b: { title: 'Block Rockin\' Beats', artist: 'The Chemical Brothers' },
    expectedDuplicate: false,
    expectedSameArtist: true,
  },
  {
    a: { title: 'One More Time', artist: 'Daft Punk' },
    b: { title: 'Hey Boy Hey Girl', artist: 'The Chemical Brothers' },
    expectedDuplicate: false,
    expectedSameArtist: false,
  },
];

let failed = 0;
for (const [idx, t] of tests.entries()) {
  const isDup = isDuplicateTrack(t.a, t.b);
  const isArtist = isSameArtist(t.a.artist, t.b.artist);
  console.log(`Test ${idx + 1}:`);
  console.log(`  A: "${t.a.title}" by "${t.a.artist}" (key: ${getTrackDedupeKey(t.a.title, t.a.artist)})`);
  console.log(`  B: "${t.b.title}" by "${t.b.artist}" (key: ${getTrackDedupeKey(t.b.title, t.b.artist)})`);
  console.log(`  isDuplicate: ${isDup} (expected: ${t.expectedDuplicate})`);
  console.log(`  isSameArtist: ${isArtist} (expected: ${t.expectedSameArtist ?? t.expectedDuplicate})`);

  if (isDup !== t.expectedDuplicate) {
    console.error(`  FAIL duplicate check!`);
    failed++;
  }
  if (t.expectedSameArtist !== undefined && isArtist !== t.expectedSameArtist) {
    console.error(`  FAIL same artist check!`);
    failed++;
  }
}

if (failed === 0) {
  console.log('\nAll tests passed successfully! 🎉');
} else {
  console.error(`\n${failed} tests failed!`);
  process.exit(1);
}
