/**
 * Diagnostic test script for stream resolver candidate matching.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const UNWANTED_VARIANTS = [
  'live',
  'karaoke',
  '8d',
  'slowed',
  'reverb',
  'nightcore',
  'cover',
  'instrumental',
  'tribute',
  'remake',
  'parody',
  'bass boosted',
  'mix',
  'medley',
  'podcast',
  'full album',
];

function isVariantClean(candidateTitle: string, canonicalTitle: string): boolean {
  const normCandidate = candidateTitle.toLowerCase();
  const normCanonical = canonicalTitle.toLowerCase();

  for (const word of UNWANTED_VARIANTS) {
    if (normCandidate.includes(word) && !normCanonical.includes(word)) {
      return false;
    }
  }
  return true;
}

function hasTitleMatch(candidateTitle: string, canonicalTitle: string): boolean {
  const words = canonicalTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !['the', 'and', 'feat', 'ft', 'official', 'audio', 'video'].includes(w));

  if (words.length === 0) return true;
  const normCandidate = candidateTitle.toLowerCase();
  const matched = words.filter((w) => normCandidate.includes(w));
  return matched.length / words.length >= 0.5;
}

async function testQuery(artist: string, title: string, expectedSec: number) {
  console.log(`\n======================================================`);
  console.log(`Searching for: "${artist} - ${title}" (Target Duration: ${expectedSec}s)`);
  console.log(`======================================================`);

  const query = `scsearch10:${artist} - ${title}`;
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--dump-json',
      '--no-warnings',
      '--no-check-certificates',
      query,
    ], { timeout: 15000 });

    const lines = stdout.trim().split('\n').filter(Boolean);
    console.log(`Received ${lines.length} candidates from SoundCloud:`);

    const maxDiff = Math.min(20, Math.max(12, expectedSec * 0.08));
    const cleanMatches: any[] = [];

    for (const line of lines) {
      const item = JSON.parse(line);
      const duration = item.duration || 0;
      const diff = Math.abs(duration - expectedSec);
      const isClean = isVariantClean(item.title, title);
      const titleMatch = hasTitleMatch(item.title, title);
      const withinDiff = diff <= maxDiff;
      const isGoPlusPreview = expectedSec > 60 && duration <= 35;

      const accepted = isClean && titleMatch && withinDiff && !isGoPlusPreview;

      console.log(` - [${accepted ? 'ACCEPT' : 'REJECT'}] "${item.title}" by "${item.uploader}" | ${duration.toFixed(1)}s (diff: ${diff.toFixed(1)}s)`);
      if (!accepted) {
        const reasons = [];
        if (!isClean) reasons.push('unwanted variant');
        if (!titleMatch) reasons.push('title mismatch');
        if (!withinDiff) reasons.push(`diff ${diff.toFixed(1)}s > maxDiff ${maxDiff.toFixed(1)}s`);
        if (isGoPlusPreview) reasons.push('Go+ 30s preview');
        console.log(`     Reason: ${reasons.join(', ')}`);
      } else {
        cleanMatches.push({ item, diff });
      }
    }

    if (cleanMatches.length > 0) {
      cleanMatches.sort((a, b) => a.diff - b.diff);
      const best = cleanMatches[0];
      console.log(`\n🎯 WINNER: "${best.item.title}" (${best.item.duration}s, diff: ${best.diff.toFixed(1)}s)`);
    } else {
      console.log(`\n⚠️ NO CLEAN MATCH FOUND. Will safely fall back to 30s Deezer preview.`);
    }
  } catch (err: any) {
    console.error('Search failed:', err.message);
  }
}

async function run() {
  await testQuery('The Offspring', 'Americana', 195);
  await testQuery('Rameses B', 'New Dawn', 200);
  await testQuery('Led Zeppelin', 'Ten Years Gone', 392);
  await testQuery('Daft Punk', 'One More Time', 320);
  await testQuery('System Of A Down', 'Toxicity', 219);
}

run();
