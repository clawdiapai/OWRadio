import assert from 'node:assert';
import { detectTrackLanguage, detectTrackLanguageDetails } from '../src/services/languageDetector.js';

console.log('🧪 Testing Option B Multi-Signal Language Classifier (ISRC + SQLite + Subwords)...\n');

const testCases = [
  // 1. Core Baseline Hits
  { title: 'Comportement', artist: 'Aya Nakamura', isrc: 'FRZ041800369', expected: 'fr' },
  { title: 'Oublie-le', artist: 'Dadju', isrc: undefined, expected: 'fr' },
  { title: 'Compliqué', artist: 'Dadju', isrc: undefined, expected: 'fr' },
  { title: "D'or et d'étain", artist: 'Vianney', isrc: undefined, expected: 'fr' },
  { title: "J'PENSE À TOI", artist: 'RnBoi', isrc: undefined, expected: 'fr' },
  { title: 'Aline', artist: 'Christophe', isrc: undefined, expected: 'fr' },
  { title: 'Stressed Out', artist: 'Twenty One Pilots', isrc: 'USAT21500903', expected: 'en' },
  { title: 'Everytime We Touch', artist: 'Cascada', isrc: 'DEUM70501234', expected: 'en' },
  { title: '100,000 Years', artist: 'KISS', isrc: 'USPR37500012', expected: 'en' },
  { title: 'Despechá', artist: 'Rosalía', isrc: 'USSM12207207', expected: 'es' },
  { title: 'Tití Me Preguntó', artist: 'Bad Bunny', isrc: 'USUM72203001', expected: 'es' },
  { title: 'Du Hast', artist: 'Rammstein', isrc: 'DEG129700011', expected: 'de' },
  { title: 'Torna a casa', artist: 'Måneskin', isrc: 'ITSM11800045', expected: 'it' },
  { title: 'Meet Me On The Corner (Live; The Charisma Years 1970 - 1973)', artist: 'Lindisfarne', isrc: 'GBAYK7100023', expected: 'en' },

  // 2. Bilingual Artist Tests (Crucial 2026 Test!)
  { title: 'My Heart Will Go On', artist: 'Céline Dion', isrc: 'USSM19700450', expected: 'en' },
  { title: "Pour que tu m'aimes encore", artist: 'Céline Dion', isrc: 'FRZ049500020', expected: 'fr' },
  { title: 'Around the World', artist: 'Daft Punk', isrc: 'GBDUW9700004', expected: 'en' },
  { title: 'One More Time', artist: 'Daft Punk', isrc: 'GBDUW0000059', expected: 'en' },

  // 3. Slang & Regional Tests
  { title: 'Dégun', artist: 'Lagui', isrc: 'FRZ042100001', expected: 'fr' },
  { title: 'Sur la piste', artist: 'Eva', isrc: 'FRZ041900002', expected: 'fr' },
];

let passed = 0;
for (const tc of testCases) {
  const details = detectTrackLanguageDetails(tc.title, tc.artist, undefined, tc.isrc);
  const ok = details.language === tc.expected;
  if (ok) passed++;
  console.log(`${ok ? '✅' : '❌'} "${tc.artist} - ${tc.title}" => ${details.language} (expected: ${tc.expected}, confidence: ${details.confidence}, source: ${details.source})`);
}
console.log(`\nTest cases passed: ${passed}/${testCases.length}`);
assert.strictEqual(passed, testCases.length, 'All test cases must pass');

// 4. Test In-Memory and SQLite Caching
console.log('\n--- Testing 0ms Cache Performance ---');
const t0 = performance.now();
const cached1 = detectTrackLanguageDetails('Dégun', 'Lagui');
const t1 = performance.now();
console.log(`✅ 1st Lookup (LRU Cache hit): ${cached1.language} (${(t1 - t0).toFixed(3)}ms, source: ${cached1.source})`);
assert.strictEqual(cached1.source, 'cache_memory');

console.log('\n🎉 Option B Multi-Signal Cascade Tests Passed Flawlessly!\n');
