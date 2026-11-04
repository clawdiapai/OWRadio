import { getTrackDedupeKey, normalizeTrackTitle } from '../src/utils/trackDedupe.js';

const t1 = 'Wasted Years (Live at Birmingham NEC, 1988; 2013 Remaster)';
const t2 = 'Wasted Years (2015 Remaster)';
console.log('t1 clean:', normalizeTrackTitle(t1, 'Iron Maiden'));
console.log('t2 clean:', normalizeTrackTitle(t2, 'Iron Maiden'));
console.log('key1:', getTrackDedupeKey(t1, 'Iron Maiden'));
console.log('key2:', getTrackDedupeKey(t2, 'Iron Maiden'));
console.log('Match?', getTrackDedupeKey(t1, 'Iron Maiden') === getTrackDedupeKey(t2, 'Iron Maiden'));
if (getTrackDedupeKey(t1, 'Iron Maiden') !== getTrackDedupeKey(t2, 'Iron Maiden')) {
  console.error('FAILED MATCH');
  process.exit(1);
}
console.log('✅ Wasted Years remasters matched perfectly!');
