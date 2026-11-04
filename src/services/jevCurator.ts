/**
 * @file jevCurator.ts
 * @description Jev-like Discriminative Decision Architecture for VEXO.
 * Implements a "System One" decision model (SemIf / candidate scoring paradigm).
 * Evaluates candidate song choices directly against active room listener context in a
 * single-pass forward evaluation, outputting calibrated decision rankings without
 * slow autoregressive text token generation or hallucinated titles.
 */

import { sqlite } from '../db/index.js';
import config from '../config.js';
import brainLogger from './brainLogger.js';
import type { CuratedTrackResult, RoomTasteProfile } from './curator.js';
import { isTrackEligibleForAutoplay } from './curator.js';
import { detectTrackLanguage } from './languageDetector.js';
import type { DeezerTrackMetadata } from './deezer.js';

interface CatalogSong {
  id: string;
  deezerId?: string;
  youtubeId?: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  durationSec: number;
  artworkUrl?: string;
  artworkThumbUrl?: string;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const SEED_ERAS = [
  '1980s Post-Punk & Synth',
  '1990s French Touch & Electro',
  '1970s Funk & Soul',
  '2000s Indie Dance & Nu-Gaze',
  '2010s Future Funk & Vaporwave',
  '1990s Trip-Hop & Acid Jazz',
  'Modern Deep House & Melodic Techno',
  'Cyberpunk Darksynth',
  '1960s Psychedelic Rock & Baroque Pop',
  '2000s Neo-Soul & R&B Grooves',
  'Uplifting Vocal Trance & Progressive',
  'Mid-2000s Electro Clash & Bloghouse',
];

class JevCurator {
  /**
   * Samples a diverse slate of eligible candidate tracks from the catalog.
   */
  private sampleCandidatePool(
    roomProfile: RoomTasteProfile,
    queuedSongIds: Set<string>,
    queuedArtists: Set<string>,
    poolSize = 8,
    queuedLanguages: Set<string> = new Set()
  ): CatalogSong[] {
    const dislikedSet = new Set(roomProfile.dislikedArtists.map((a) => a.toLowerCase().trim()));

    // Draw candidate tracks from catalog with bias toward liked artists if available
    let candidates: CatalogSong[] = [];

    if (roomProfile.topLikedArtists.length > 0 && Math.random() < 0.6) {
      const placeholders = roomProfile.topLikedArtists.slice(0, 5).map(() => '?').join(',');
      const rows = sqlite.prepare(`
        SELECT id, deezer_id as deezerId, youtube_id as youtubeId, title, artist, album, genre,
               duration_sec as durationSec, artwork_url as artworkUrl, artwork_thumb_url as artworkThumbUrl
        FROM songs
        WHERE LOWER(artist) IN (${placeholders})
        ORDER BY RANDOM()
        LIMIT 6
      `).all(...roomProfile.topLikedArtists.slice(0, 5).map((a) => a.toLowerCase())) as CatalogSong[];
      candidates.push(...rows);
    }

    // Fill remaining candidates with random catalog exploration
    const needed = Math.max(12, poolSize * 2) - candidates.length;
    const randomRows = sqlite.prepare(`
      SELECT id, deezer_id as deezerId, youtube_id as youtubeId, title, artist, album, genre,
             duration_sec as durationSec, artwork_url as artworkUrl, artwork_thumb_url as artworkThumbUrl
      FROM songs
      WHERE artist IS NOT NULL AND title IS NOT NULL
      ORDER BY RANDOM()
      LIMIT ?
    `).all(needed) as CatalogSong[];

    candidates.push(...randomRows);

    // Apply strict 48h/2h/language cooldowns, disliked vetoes, and queue deduplication
    const filtered: CatalogSong[] = [];
    const seenArtists = new Set<string>();

    for (const song of candidates) {
      const artistNorm = song.artist.toLowerCase().trim();
      if (dislikedSet.has(artistNorm) || seenArtists.has(artistNorm)) continue;
      if (!isTrackEligibleForAutoplay(song.id, song.artist, queuedSongIds, queuedArtists, song.title, undefined, song.durationSec, queuedLanguages)) continue;

      seenArtists.add(artistNorm);
      const songLang = detectTrackLanguage(song.title, song.artist);
      if (songLang !== 'en') queuedLanguages.add(songLang);
      filtered.push(song);
      if (filtered.length >= poolSize) break;
    }

    return filtered;
  }

  /**
   * Main Curation Entry Point: Jev-like Discriminative Decision Pass.
   */
  public async curateNextTracks(
    roomProfile: RoomTasteProfile,
    activeUserIds: string[],
    count = 2,
    queuedSongIds: Set<string> = new Set(),
    queuedArtists: Set<string> = new Set(),
    queuedLanguages: Set<string> = new Set()
  ): Promise<CuratedTrackResult[]> {
    const tStart = performance.now();
    const seedEra = SEED_ERAS[Math.floor(Math.random() * SEED_ERAS.length)];

    // 1. Prepare typed candidate slate
    const candidatePool = this.sampleCandidatePool(roomProfile, queuedSongIds, queuedArtists, 8, queuedLanguages);
    if (candidatePool.length === 0) {
      console.warn('[JevCurator] Candidate pool empty, skipping decision pass.');
      return [];
    }

    // 2. Build Room Context representation
    const contextLines: string[] = [`Target Vibe / Era: ${seedEra}`];
    if (roomProfile.topLikedArtists.length > 0) {
      contextLines.push(`Liked Artists: ${roomProfile.topLikedArtists.slice(0, 5).join(', ')}`);
    }
    if (roomProfile.topLikedSongs.length > 0) {
      contextLines.push(`Liked Tracks: ${roomProfile.topLikedSongs.slice(0, 3).join(', ')}`);
    }
    if (roomProfile.dislikedArtists.length > 0) {
      contextLines.push(`Vetoed (Do NOT Pick): ${roomProfile.dislikedArtists.slice(0, 3).join(', ')}`);
    }

    const contextStr = contextLines.join(' | ');

    const selectedResults: CuratedTrackResult[] = [];
    const remainingPool = [...candidatePool];

    // 3. Sequential Decision Pass (or Multi-Choice Forward Pass)
    for (let step = 0; step < count; step++) {
      if (remainingPool.length === 0) break;

      const currentLetters = LETTERS.slice(0, remainingPool.length);
      const choicesStr = remainingPool
        .map((c, i) => `[${currentLetters[i]}] ${c.artist} - ${c.title}${c.genre ? ` (${c.genre})` : ''}`)
        .join('\n');

      const prompt = `<|im_start|>system
You are a Jev-like discriminative decision model. You do not generate text or conversational explanations. Evaluate the room context against the typed candidate choices and output ONLY the single winning option letter (e.g. A, B, C, etc.).<|im_end|>
<|im_start|>user
Room Context: ${contextStr}

Typed Candidate Choices:
${choicesStr}

Decision (output single winning letter only):<|im_end|>
<|im_start|>assistant
`;

      try {
        const res = await fetch(`${config.OLLAMA_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.OLLAMA_MODEL,
            prompt,
            stream: false,
            options: {
              num_predict: 1, // System 1 forward pass: exactly 1 decision token!
              temperature: 0.0,
            },
          }),
        });

        if (!res.ok) {
          console.warn(`[JevCurator] Ollama decision pass failed with HTTP ${res.status}`);
          break;
        }

        const data = (await res.json()) as any;
        const answerRaw = (data.response || '').trim().toUpperCase().replace(/[^A-H]/g, '');
        const chosenLetter = answerRaw[0] || currentLetters[0];
        const chosenIndex = currentLetters.indexOf(chosenLetter);
        const validIndex = chosenIndex >= 0 ? chosenIndex : 0;
        const winner = remainingPool[validIndex];

        const trackMeta: DeezerTrackMetadata = {
          id: winner.id,
          deezerId: winner.deezerId || winner.id,
          title: winner.title,
          artist: winner.artist,
          album: winner.album,
          durationSec: winner.durationSec,
          artworkUrl: winner.artworkUrl || '',
          artworkThumbUrl: winner.artworkThumbUrl || '',
        };

        const evalTimeMs = data.prompt_eval_duration
          ? Math.round(data.prompt_eval_duration / 1e6)
          : Math.round(performance.now() - tStart);

        selectedResults.push({
          track: trackMeta,
          curatedBy: 'Jev Decision Engine',
          curationReason: `Jev Calibrated Decision [Option ${currentLetters[validIndex]}] | Forward eval: ${evalTimeMs}ms`,
        });

        queuedSongIds.add(winner.id);
        queuedArtists.add(winner.artist.toLowerCase());
        remainingPool.splice(validIndex, 1);
      } catch (err) {
        console.warn('[JevCurator] Decision step error:', (err as Error).message);
        break;
      }
    }

    const durationMs = Math.round(performance.now() - tStart);

    // 4. Telemetry logging
    brainLogger.logInteraction({
      timestamp: Math.floor(Date.now() / 1000),
      model: `${config.OLLAMA_MODEL} (Jev Decision Head)`,
      action: 'jev_decision',
      prompt: `Jev Decision Pass (${candidatePool.length} candidates evaluated against room taste)`,
      response: JSON.stringify(
        selectedResults.map((s) => ({
          track: `${s.track.artist} - ${s.track.title}`,
          curatedBy: s.curatedBy,
          reason: s.curationReason,
        })),
        null,
        2
      ),
      durationMs,
      status: selectedResults.length > 0 ? 'success' : 'fallback',
      metadata: {
        engine: 'jev',
        candidatesEvaluated: candidatePool.length,
        selectedCount: selectedResults.length,
        seedEra,
      },
    });

    console.log(`[JevCurator] Selected ${selectedResults.length} tracks via discriminative decision in ${durationMs}ms`);
    return selectedResults;
  }
}

export const jevCurator = new JevCurator();
export default jevCurator;
