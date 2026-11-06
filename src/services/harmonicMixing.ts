/**
 * @file harmonicMixing.ts
 * @description Harmonic mixing analysis and adaptive crossfade engine for VEXO.
 * Uses Camelot Wheel key compatibility and BPM delta to calculate smooth DJ blends.
 * 100% genuine data: returns undefined when audio features have not been verified.
 */

import featureFlags from './featureFlags.js';

export interface HarmonicProfile {
  bpm?: number;
  key?: string;       // Camelot notation e.g. "8A" (A minor), "8B" (C major)
  keyName?: string;   // e.g. "A minor"
}

export interface MixingAnalysis {
  isHarmonicMatch: boolean;
  bpmDeltaPct: number;
  recommendedCrossfadeSec: number;
  crossfadeFrames: number; // 1 frame = 20ms
  reason: string;
}

// 12 Camelot positions (1 to 12) with A (minor) and B (major)
const CAMELOT_KEYS = [
  '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B',
  '5A', '5B', '6A', '6B', '7A', '7B', '8A', '8B',
  '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B',
];

const STANDARD_KEY_MAP: Record<string, string> = {
  'abm': '1A', 'g#m': '1A', 'b': '1B',
  'ebm': '2A', 'd#m': '2A', 'f#': '2B', 'gb': '2B',
  'bbm': '3A', 'a#m': '3A', 'db': '3B', 'c#': '3B',
  'fm': '4A', 'ab': '4B',
  'cm': '5A', 'eb': '5B',
  'gm': '6A', 'bb': '6B',
  'dm': '7A', 'f': '7B',
  'am': '8A', 'c': '8B',
  'em': '9A', 'g': '9B',
  'bm': '10A', 'd': '10B',
  'f#m': '11A', 'gbm': '11A', 'a': '11B',
  'c#m': '12A', 'dbm': '12A', 'e': '12B',
};

class HarmonicMixingService {
  /**
   * Evaluates or normalizes musical key and BPM for a track.
   * Returns undefined for unverified fields without synthesizing fake data.
   */
  public analyzeTrack(title: string, artist: string, bpmHint?: number, keyHint?: string): HarmonicProfile {
    let camelotKey: string | undefined = undefined;
    if (keyHint) {
      const cleanKey = keyHint.toLowerCase().replace(/[\s_]/g, '');
      if (CAMELOT_KEYS.includes(cleanKey.toUpperCase())) {
        camelotKey = cleanKey.toUpperCase();
      } else if (STANDARD_KEY_MAP[cleanKey]) {
        camelotKey = STANDARD_KEY_MAP[cleanKey];
      }
    }

    const bpm = bpmHint && bpmHint >= 60 && bpmHint <= 200 ? Math.round(bpmHint) : undefined;

    return {
      bpm,
      key: camelotKey,
      keyName: camelotKey ? this.camelotToName(camelotKey) : undefined,
    };
  }

  /**
   * Evaluates compatibility between outgoing track and incoming track,
   * returning recommended adaptive crossfade duration.
   */
  public evaluateTransition(
    trackA: { title: string; artist: string; bpm?: number; key?: string },
    trackB: { title: string; artist: string; bpm?: number; key?: string }
  ): MixingAnalysis {
    if (!featureFlags.isEnabled('feature_harmonic_crossfade')) {
      return {
        isHarmonicMatch: false,
        bpmDeltaPct: 0,
        recommendedCrossfadeSec: 1.0,
        crossfadeFrames: 50, // default 1.0s (50 * 20ms)
        reason: 'Harmonic mixing disabled (standard 1.0s cut)',
      };
    }

    const profileA = this.analyzeTrack(trackA.title, trackA.artist, trackA.bpm, trackA.key);
    const profileB = this.analyzeTrack(trackB.title, trackB.artist, trackB.bpm, trackB.key);

    if (!profileA.key || !profileB.key || !profileA.bpm || !profileB.bpm) {
      return {
        isHarmonicMatch: false,
        bpmDeltaPct: 0,
        recommendedCrossfadeSec: 1.0,
        crossfadeFrames: 50,
        reason: 'Standard 1.0s clean cut (harmonic metadata pending)',
      };
    }

    const keyCompat = this.isKeyCompatible(profileA.key, profileB.key);
    const bpmDelta = Math.abs(profileA.bpm - profileB.bpm);
    const bpmDeltaPct = Math.round((bpmDelta / Math.max(profileA.bpm, profileB.bpm)) * 100);

    // Tier 1: Perfect Harmonic Blend (Compatible Key + BPM within 6%)
    if (keyCompat && bpmDeltaPct <= 6) {
      return {
        isHarmonicMatch: true,
        bpmDeltaPct,
        recommendedCrossfadeSec: 4.0,
        crossfadeFrames: 200, // 4.0s (200 * 20ms)
        reason: `Harmonic match (${profileA.key} ➔ ${profileB.key}, Δ${bpmDeltaPct}% BPM): 4.0s club blend`,
      };
    }

    // Tier 2: Adjacent Energy Match (Compatible Key + BPM within 14%)
    if (keyCompat && bpmDeltaPct <= 14) {
      return {
        isHarmonicMatch: true,
        bpmDeltaPct,
        recommendedCrossfadeSec: 2.5,
        crossfadeFrames: 125, // 2.5s (125 * 20ms)
        reason: `Compatible key transition (${profileA.key} ➔ ${profileB.key}): 2.5s smooth crossfade`,
      };
    }

    // Tier 3: BPM Synced but Key Shift (BPM within 5%)
    if (bpmDeltaPct <= 5) {
      return {
        isHarmonicMatch: false,
        bpmDeltaPct,
        recommendedCrossfadeSec: 1.8,
        crossfadeFrames: 90, // 1.8s (90 * 20ms)
        reason: `BPM matched (${profileB.bpm} BPM): 1.8s beat-synced fade`,
      };
    }

    // Tier 4: Tempo/Key Clash -> Fast Punchy Transition
    return {
      isHarmonicMatch: false,
      bpmDeltaPct,
      recommendedCrossfadeSec: 1.0,
      crossfadeFrames: 50, // 1.0s
      reason: `Key/Tempo shift (${profileA.key}/${profileA.bpm} ➔ ${profileB.key}/${profileB.bpm}): 1.0s clean cut`,
    };
  }

  /**
   * Checks if two Camelot keys are compatible:
   * 1. Exact match (e.g. 8A and 8A)
   * 2. Adjacent on wheel (+1 or -1 position, same letter: 7A or 9A)
   * 3. Relative major/minor flip (same number, different letter: 8A <-> 8B)
   */
  public isKeyCompatible(keyA: string, keyB: string): boolean {
    if (!keyA || !keyB) return false;
    if (keyA === keyB) return true;

    const numA = parseInt(keyA.slice(0, -1), 10);
    const letterA = keyA.slice(-1).toUpperCase();

    const numB = parseInt(keyB.slice(0, -1), 10);
    const letterB = keyB.slice(-1).toUpperCase();

    if (Number.isNaN(numA) || Number.isNaN(numB)) return false;

    // Relative major/minor
    if (numA === numB && letterA !== letterB) return true;

    // Adjacent on wheel (with wrap-around 12 <-> 1)
    if (letterA === letterB) {
      const diff = Math.abs(numA - numB);
      if (diff === 1 || diff === 11) return true;
    }

    return false;
  }

  private camelotToName(camelot: string): string {
    for (const [name, cam] of Object.entries(STANDARD_KEY_MAP)) {
      if (cam.toUpperCase() === camelot.toUpperCase()) {
        return name.toUpperCase();
      }
    }
    return camelot;
  }
}

export const harmonicMixing = new HarmonicMixingService();
export default harmonicMixing;
