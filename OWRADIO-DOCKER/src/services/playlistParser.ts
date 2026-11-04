/**
 * @file playlistParser.ts
 * @description Ingests Spotify and YouTube public playlist URLs to extract user taste DNA.
 * Saves top artists and tracks into SQLite user_preferences without requiring user OAuth logins.
 */

import { promisify } from 'util';
import { execFile } from 'child_process';
import { sqlite } from '../db/index.js';
import { normalizeArtist, normalizeTrackTitle } from '../utils/trackDedupe.js';

const execFileAsync = promisify(execFile);

export interface ParsedTrackEntry {
  title: string;
  artist: string;
}

export interface PlaylistTasteProfile {
  title: string;
  totalTracks: number;
  topArtists: Array<{ name: string; count: number }>;
  tracks: ParsedTrackEntry[];
}

export class PlaylistParserService {
  /**
   * Ingests a public Spotify or YouTube playlist URL and returns the extracted taste profile.
   */
  public async parsePlaylistUrl(url: string): Promise<PlaylistTasteProfile> {
    const trimmed = url.trim();

    if (trimmed.includes('spotify.com')) {
      return this.parseSpotifyPlaylist(trimmed);
    }

    if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      return this.parseYouTubePlaylist(trimmed);
    }

    throw new Error('Unsupported playlist URL. Please provide a public Spotify or YouTube playlist link.');
  }

  /**
   * Ingests and registers the playlist into a user's taste profile.
   */
  public async registerUserPlaylist(userId: string, playlistUrl: string): Promise<PlaylistTasteProfile> {
    const profile = await this.parsePlaylistUrl(playlistUrl);
    const now = Math.floor(Date.now() / 1000);

    const insertStmt = sqlite.prepare(`
      INSERT INTO user_preferences (user_id, target_type, target_key, display_name, likes, affinity_score, updated_at)
      VALUES (?, 'artist', ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
        likes = likes + excluded.likes,
        affinity_score = affinity_score + excluded.affinity_score,
        updated_at = excluded.updated_at
    `);

    sqlite.transaction(() => {
      // Award affinity proportional to artist frequency in their playlist
      for (const a of profile.topArtists.slice(0, 20)) {
        const normKey = normalizeArtist(a.name).toLowerCase();
        const score = Math.min(10.0, 2.0 + a.count * 1.5);
        insertStmt.run(userId, normKey, a.name, a.count, score, now);
      }
    })();

    console.log(`[PlaylistParser] 🧬 Registered taste profile for User ${userId} from playlist "${profile.title}" (${profile.totalTracks} tracks, ${profile.topArtists.length} top artists)`);
    return profile;
  }

  /**
   * Parses public Spotify playlist using the embed endpoint.
   */
  private async parseSpotifyPlaylist(url: string): Promise<PlaylistTasteProfile> {
    const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) throw new Error('Invalid Spotify playlist URL format.');

    const playlistId = match[1];
    const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;

    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`Failed to fetch Spotify playlist (HTTP ${res.status}). Ensure the playlist is public.`);
    const html = await res.text();

    const tracks: ParsedTrackEntry[] = [];
    let title = 'Spotify Playlist';

    // Try extracting JSON payload from __NEXT_DATA__ or resource script
    const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonMatch) {
      try {
        const nextData = JSON.parse(jsonMatch[1]);
        const entity = nextData?.props?.pageProps?.state?.data?.entity;
        if (entity?.name) title = entity.name;
        const trackList = entity?.trackList;
        if (Array.isArray(trackList)) {
          for (const item of trackList) {
            if (item.title && item.subtitle) {
              tracks.push({ title: item.title, artist: item.subtitle });
            }
          }
        }
      } catch {}
    }

    // Fallback: regex search for track titles & artists in HTML structure
    if (tracks.length === 0) {
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      if (titleMatch) title = titleMatch[1].replace(' | Spotify', '').trim();

      const itemRegex = /"name":"([^"]+)","artists":\[\{"name":"([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = itemRegex.exec(html)) !== null) {
        tracks.push({ title: m[1], artist: m[2] });
      }
    }

    if (tracks.length === 0) {
      throw new Error('No tracks could be extracted from this Spotify playlist. Ensure it is set to public.');
    }

    return this.buildProfile(title, tracks);
  }

  /**
   * Parses public YouTube playlist using yt-dlp flat-playlist metadata dump.
   */
  private async parseYouTubePlaylist(url: string): Promise<PlaylistTasteProfile> {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--flat-playlist',
      '--dump-single-json',
      '--no-warnings',
      url,
    ], { timeout: 20000, maxBuffer: 15 * 1024 * 1024 });

    const data = JSON.parse(stdout);
    const title = data.title || 'YouTube Playlist';
    const entries = data.entries || [];

    const tracks: ParsedTrackEntry[] = [];
    for (const item of entries) {
      const fullTitle = item.title || '';
      const uploader = item.uploader || item.channel || '';

      // Parse "Artist - Title" format common in YouTube Music
      if (fullTitle.includes(' - ')) {
        const parts = fullTitle.split(' - ');
        tracks.push({
          artist: parts[0].trim(),
          title: parts.slice(1).join(' - ').trim(),
        });
      } else if (uploader) {
        tracks.push({
          artist: uploader.replace(/ - Topic$/i, '').trim(),
          title: fullTitle.trim(),
        });
      }
    }

    if (tracks.length === 0) {
      throw new Error('No tracks could be extracted from this YouTube playlist.');
    }

    return this.buildProfile(title, tracks);
  }

  /**
   * Calculates top artists and frequency counts.
   */
  private buildProfile(title: string, tracks: ParsedTrackEntry[]): PlaylistTasteProfile {
    const artistCounts = new Map<string, { name: string; count: number }>();

    for (const t of tracks) {
      const norm = normalizeArtist(t.artist);
      if (!norm) continue;
      const key = norm.toLowerCase();
      const existing = artistCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        artistCounts.set(key, { name: t.artist, count: 1 });
      }
    }

    const topArtists = Array.from(artistCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    return {
      title,
      totalTracks: tracks.length,
      topArtists,
      tracks,
    };
  }
}

export const playlistParser = new PlaylistParserService();
export default playlistParser;
