/**
 * @file camelotWheel.ts
 * @description Harmonic mixing calculator and Camelot Wheel distance engine.
 * Computes musical compatibility between songs for professional DJ transitions.
 */

export interface HarmonicKey {
  pitchClass: number; // 0 = C, 1 = C#, 2 = D, ..., 11 = B
  mode: 'major' | 'minor';
  camelot: string; // e.g. "8A", "8B"
  name: string; // e.g. "A minor", "C major"
}

// Standard mapping of pitch class (0-11) and mode to Camelot codes
const CAMELOT_MAP: Record<string, string> = {
  // Minor (A)
  '0_minor': '5A',  // C minor
  '1_minor': '12A', // C# minor
  '2_minor': '7A',  // D minor
  '3_minor': '2A',  // Eb minor
  '4_minor': '9A',  // E minor
  '5_minor': '4A',  // F minor
  '6_minor': '11A', // F# minor
  '7_minor': '6A',  // G minor
  '8_minor': '1A',  // Ab minor
  '9_minor': '8A',  // A minor
  '10_minor': '3A', // Bb minor
  '11_minor': '10A',// B minor

  // Major (B)
  '0_major': '8B',  // C major
  '1_major': '3B',  // Db major
  '2_major': '10B', // D major
  '3_major': '5B',  // Eb major
  '4_major': '12B', // E major
  '5_major': '7B',  // F major
  '6_major': '2B',  // F# major
  '7_major': '9B',  // G major
  '8_major': '4B',  // Ab major
  '9_major': '11B', // A major
  '10_major': '6B', // Bb major
  '11_major': '1B', // B major
};

/**
 * Returns the Camelot code for a given pitch class (0-11) and mode ('major' | 'minor').
 */
export function getCamelotCode(pitchClass: number, mode: 'major' | 'minor'): string {
  const key = `${pitchClass % 12}_${mode.toLowerCase()}`;
  return CAMELOT_MAP[key] || '8A';
}

/**
 * Parses a Camelot code (e.g. "8A", "11B") into number (1-12) and letter ('A' | 'B').
 */
export function parseCamelot(camelot: string): { num: number; letter: 'A' | 'B' } | null {
  const m = camelot.trim().toUpperCase().match(/^(\d{1,2})([AB])$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 12) return null;
  return { num, letter: m[2] as 'A' | 'B' };
}

/**
 * Calculates harmonic compatibility score (0.0 to 1.0) between two Camelot keys.
 * 1.0 = exact key match (8A -> 8A)
 * 0.8 = adjacent step (+1 / -1 on wheel: 8A -> 9A or 8A -> 7A)
 * 0.8 = relative major/minor (same number, flip letter: 8A -> 8B)
 * 0.5 = diagonal shift (+1 / -1 and flip letter: 8A -> 9B)
 * 0.1 = dissonant jump
 */
export function getHarmonicCompatibility(keyA?: string | null, keyB?: string | null): number {
  if (!keyA || !keyB) return 0.5; // Neutral when keys are unknown

  const a = parseCamelot(keyA);
  const b = parseCamelot(keyB);
  if (!a || !b) return 0.5;

  if (a.num === b.num && a.letter === b.letter) {
    return 1.0; // Perfect match
  }

  // Circular distance around the 12-hour wheel (min of clockwise vs counter-clockwise)
  const diffNum = Math.abs(a.num - b.num);
  const circularDist = Math.min(diffNum, 12 - diffNum);

  if (a.letter === b.letter) {
    if (circularDist === 1) return 0.85; // Energy lift / release (+1 or -1 on Camelot)
    if (circularDist === 2) return 0.4;
    return 0.1;
  } else {
    // Cross-mode transition (Major <-> Minor)
    if (circularDist === 0) return 0.85; // Relative key (e.g. 8A Am <-> 8B Cmaj)
    if (circularDist === 1) return 0.5;  // Diagonal shift
    return 0.1;
  }
}

/**
 * Calculates BPM compatibility score (0.0 to 1.0) between two tracks.
 * Handles same tempo (e.g. 120 -> 124) as well as half-time / double-time transitions (e.g. 70 -> 140).
 */
export function getBpmCompatibility(bpmA?: number | null, bpmB?: number | null): number {
  if (!bpmA || !bpmB || bpmA <= 0 || bpmB <= 0) return 0.5;

  // Direct delta
  const diffDirect = Math.abs(bpmA - bpmB);
  if (diffDirect <= 4) return 1.0;
  if (diffDirect <= 8) return 0.85;
  if (diffDirect <= 15) return 0.6;

  // Check double-time / half-time (e.g. 70 to 140, or 150 to 75)
  const ratio = bpmB > bpmA ? bpmB / bpmA : bpmA / bpmB;
  if (Math.abs(ratio - 2.0) < 0.08) return 0.9; // Double-time / half-time match

  if (diffDirect > 25) return 0.2;
  return 0.4;
}

export default {
  getCamelotCode,
  parseCamelot,
  getHarmonicCompatibility,
  getBpmCompatibility,
};
