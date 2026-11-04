import { detectTrackLanguage } from '../src/services/languageDetector.js';

const testCases = [
  { title: 'Comportement', artist: 'Aya Nakamura', expected: 'fr' },
  { title: 'Oublie-le', artist: 'Dadju', expected: 'fr' },
  { title: 'Compliqué', artist: 'Dadju', expected: 'fr' },
  { title: "D'or et d'étain", artist: 'Vianney', expected: 'fr' },
  { title: "J'PENSE À TOI", artist: 'RnBoi', expected: 'fr' },
  { title: 'Aline', artist: 'Christophe', expected: 'fr' },
  { title: 'Stressed Out', artist: 'Twenty One Pilots', expected: 'en' },
  { title: 'Everytime We Touch', artist: 'Cascada', expected: 'en' },
  { title: '100,000 Years', artist: 'KISS', expected: 'en' },
  { title: 'Despechá', artist: 'Rosalía', expected: 'es' },
  { title: 'Tití Me Preguntó', artist: 'Bad Bunny', expected: 'es' },
  { title: 'Du Hast', artist: 'Rammstein', expected: 'de' },
  { title: 'Torna a casa', artist: 'Måneskin', expected: 'it' },
  { title: 'Meet Me On The Corner (Live; The Charisma Years 1970 - 1973)', artist: 'Lindisfarne', expected: 'en' },
];

let passed = 0;
for (const tc of testCases) {
  const result = detectTrackLanguage(tc.title, tc.artist);
  const ok = result === tc.expected;
  if (ok) passed++;
  console.log(`${ok ? '✅' : '❌'} "${tc.artist} - ${tc.title}" => ${result} (expected: ${tc.expected})`);
}
console.log(`Passed ${passed}/${testCases.length}`);
if (passed !== testCases.length) process.exit(1);