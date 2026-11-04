/**
 * @file linkParser.ts
 * @description Robust URL parser identifying streaming providers (Deezer, Spotify, YouTube, Apple Music)
 * and extracting resource types (track, album, playlist) and identifiers.
 */

export type ParsedLinkType = 'track' | 'album' | 'playlist' | 'unknown';
export type ParsedProvider = 'deezer' | 'spotify' | 'youtube' | 'apple' | 'unknown';

export interface ParsedLink {
  provider: ParsedProvider;
  type: ParsedLinkType;
  id: string;
  playlistId?: string;
  originalUrl: string;
}

/**
 * Parses an arbitrary input string to determine if it is a supported music service URL.
 * Returns null if the string is a regular text query rather than a URL.
 */
export function parseMusicLink(input: string): ParsedLink | null {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;

    // --- Deezer ---
    if (host.includes('deezer.com')) {
      // Matches /track/12345 or /en/track/12345
      const trackMatch = pathname.match(/(?:^|\/)track\/(\d+)/i);
      if (trackMatch) return { provider: 'deezer', type: 'track', id: trackMatch[1], originalUrl: trimmed };

      const albumMatch = pathname.match(/(?:^|\/)album\/(\d+)/i);
      if (albumMatch) return { provider: 'deezer', type: 'album', id: albumMatch[1], originalUrl: trimmed };

      const playlistMatch = pathname.match(/(?:^|\/)playlist\/(\d+)/i);
      if (playlistMatch) return { provider: 'deezer', type: 'playlist', id: playlistMatch[1], originalUrl: trimmed };

      return { provider: 'deezer', type: 'unknown', id: pathname, originalUrl: trimmed };
    }

    // --- Spotify ---
    if (host.includes('spotify.com')) {
      const parts = pathname.split('/').filter(Boolean);
      // Handles /track/id, /intl-en/track/id, /album/id, /playlist/id
      const typeIndex = parts.findIndex(p => ['track', 'album', 'playlist'].includes(p.toLowerCase()));
      if (typeIndex !== -1 && parts[typeIndex + 1]) {
        const type = parts[typeIndex].toLowerCase() as ParsedLinkType;
        const id = parts[typeIndex + 1].split('?')[0];
        return { provider: 'spotify', type, id, originalUrl: trimmed };
      }
    }

    // --- YouTube ---
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      const list = url.searchParams.get('list') || undefined;
      if (host.includes('youtu.be')) {
        const id = pathname.replace(/^\//, '').split('?')[0];
        if (id) return { provider: 'youtube', type: 'track', id, playlistId: list, originalUrl: trimmed };
      }
      const v = url.searchParams.get('v');

      // If URL is explicitly a playlist endpoint (/playlist?list=...)
      if (list && (!v || pathname.includes('/playlist'))) {
        return { provider: 'youtube', type: 'playlist', id: list, playlistId: list, originalUrl: trimmed };
      }

      if (v) return { provider: 'youtube', type: 'track', id: v, playlistId: list, originalUrl: trimmed };
      if (list) return { provider: 'youtube', type: 'playlist', id: list, playlistId: list, originalUrl: trimmed };
    }

    // --- Apple Music ---
    if (host.includes('music.apple.com')) {
      const albumMatch = pathname.match(/\/album\/[^/]+\/(\d+)/i);
      const songParam = url.searchParams.get('i');
      if (songParam) return { provider: 'apple', type: 'track', id: songParam, originalUrl: trimmed };
      if (albumMatch) return { provider: 'apple', type: 'album', id: albumMatch[1], originalUrl: trimmed };
      if (pathname.includes('/playlist/')) return { provider: 'apple', type: 'playlist', id: pathname, originalUrl: trimmed };
    }

    return null;
  } catch {
    // Not a valid URL, treat as freeform search query
    return null;
  }
}

export default {
  parseMusicLink,
};
