/**
 * @file PlaylistBlender.ts
 * @description Fair-Share Multi-User Playlist Blending and Single-Request Priority Engine.
 * 
 * Features:
 * 1. Single Request VIP Priority: Single track requests jump ahead of bulk playlists to play Up Next.
 * 2. Multi-User Playlist Interleaving: Round-robin interleaving across distinct users/playlists (A1, B1, A2, B2...).
 * 3. Harmonic Smart Blending: Acoustically and harmonic-aware track transitions between user playlists.
 * 4. Deck B Standby Preservation: Protects the currently primed Deck B upcoming track at index 0 from being evicted.
 */

import { AudioTrack } from './AudioTrack.js';
import harmonicMixing from '../services/harmonicMixing.js';
import dynamicSettings from '../services/dynamicSettings.js';

export class PlaylistBlender {
  /**
   * Inserts an individual single song request into the queue with VIP priority.
   * If single_request_priority is enabled, jumps ahead of bulk playlist tracks.
   */
  public static insertSingleRequest(
    queue: AudioTrack[],
    track: AudioTrack
  ): AudioTrack[] {
    const isVipPriority = dynamicSettings.getBoolean('curation_single_request_priority', true);

    // If queue is empty, simply append
    if (queue.length === 0) {
      return [track];
    }

    // Standard FIFO mode (no VIP priority)
    if (!isVipPriority) {
      const firstAutoplayIdx = queue.findIndex((t) => !t.isManualRequest);
      const res = [...queue];
      if (firstAutoplayIdx === -1) {
        res.push(track);
      } else {
        res.splice(firstAutoplayIdx, 0, track);
      }
      return res;
    }

    // VIP Priority Mode
    const res = [...queue];

    // If head track is an autoplay track, replace it at the very top (Up Next immediately)
    if (!res[0].isManualRequest) {
      res.unshift(track);
      return res;
    }

    // If head track is manual, preserve head (Deck B primed) and find insertion index
    // Insert after any existing single manual requests in the front section
    let insertIdx = 1;
    while (insertIdx < res.length && res[insertIdx].requestType === 'single') {
      insertIdx++;
    }

    res.splice(insertIdx, 0, track);
    return res;
  }

  /**
   * Blends a new batch of playlist tracks into an existing queue.
   */
  public static blendPlaylistBatch(
    queue: AudioTrack[],
    newTracks: AudioTrack[]
  ): AudioTrack[] {
    if (newTracks.length === 0) return queue;
    if (queue.length === 0) return [...newTracks];

    const blendMode = dynamicSettings.getString('curation_playlist_blend_mode', 'interleaved');

    // Sequential mode: append new tracks after existing manual tracks (legacy FIFO)
    if (blendMode === 'sequential') {
      const firstAutoplayIdx = queue.findIndex((t) => !t.isManualRequest);
      const res = [...queue];
      if (firstAutoplayIdx === -1) {
        res.push(...newTracks);
      } else {
        res.splice(firstAutoplayIdx, 0, ...newTracks);
      }
      return res;
    }

    // Interleaved / Harmonic Fair-Share Blending Mode:
    // 1. Separate queue into Protected Head, Single VIP Requests, Existing Playlists, and Autoplay
    const protectedHead: AudioTrack[] = [];
    const singleVipTracks: AudioTrack[] = [];
    const existingPlaylistTracks: AudioTrack[] = [];
    const autoplayTracks: AudioTrack[] = [];

    // Protect queue[0] (primed Deck B) if present
    if (queue.length > 0) {
      protectedHead.push(queue[0]);
    }

    for (let i = 1; i < queue.length; i++) {
      const t = queue[i];
      if (!t.isManualRequest) {
        autoplayTracks.push(t);
      } else if (t.requestType === 'single') {
        singleVipTracks.push(t);
      } else {
        existingPlaylistTracks.push(t);
      }
    }

    // 2. Group all playlist tracks (existing + new) into buckets by user or playlistId
    const bucketMap = new Map<string, AudioTrack[]>();

    const addToBucket = (track: AudioTrack) => {
      const key = track.playlistId || track.requestedBy || 'playlist_default';
      const list = bucketMap.get(key) || [];
      list.push(track);
      bucketMap.set(key, list);
    };

    for (const t of existingPlaylistTracks) {
      addToBucket(t);
    }
    for (const t of newTracks) {
      addToBucket(t);
    }

    // 3. Round-Robin Interleave across distinct buckets
    const blendedPlaylistTracks: AudioTrack[] = [];
    const bucketKeys = Array.from(bucketMap.keys());
    let hasMore = true;
    let previousTrack: AudioTrack | null = protectedHead[0] || null;

    while (hasMore) {
      hasMore = false;
      for (const key of bucketKeys) {
        const pool = bucketMap.get(key)!;
        if (pool && pool.length > 0) {
          hasMore = true;

          // Harmonic mode: inspect top candidates to find smoothest transition
          if (blendMode === 'harmonic' && previousTrack && pool.length > 1) {
            let bestIdx = 0;
            let bestScore = -1;
            const lookahead = Math.min(3, pool.length);

            for (let c = 0; c < lookahead; c++) {
              const candidate = pool[c];
              const analysis = harmonicMixing.evaluateTransition(previousTrack, candidate);
              const score = (analysis.isHarmonicMatch ? 100 : 0) - analysis.bpmDeltaPct;
              if (score > bestScore) {
                bestScore = score;
                bestIdx = c;
              }
            }

            const chosen = pool.splice(bestIdx, 1)[0];
            blendedPlaylistTracks.push(chosen);
            previousTrack = chosen;
          } else {
            // Pure fair round-robin
            const chosen = pool.shift()!;
            blendedPlaylistTracks.push(chosen);
            previousTrack = chosen;
          }
        }
      }
    }

    // 4. Assemble the final queue:
    // [Protected Head, Single VIP Requests, Blended Playlists, Autoplay Tracks]
    return [
      ...protectedHead,
      ...singleVipTracks,
      ...blendedPlaylistTracks,
      ...autoplayTracks,
    ];
  }
}

export default PlaylistBlender;
