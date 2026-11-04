/**
 * @file AudioTrack.ts
 * @description Domain model for playable tracks in VEXO with serialization for IoT/web endpoints.
 */

import type { DeezerTrackMetadata } from '../services/deezer.js';

export type RequestType = 'single' | 'playlist' | 'autoplay';

export interface AudioTrackOptions {
  id: string;
  title: string;
  artist: string;
  album?: string;
  releaseYear?: number;
  durationSec: number;
  artworkUrl?: string;
  artworkThumbUrl?: string;
  previewUrl?: string;
  requestedBy: string;
  isManualRequest: boolean;
  requestType?: RequestType;
  playlistId?: string;
  playlistTitle?: string;
  curatedBy?: string;
  curationReason?: string;
}

export class AudioTrack {
  public readonly id: string;
  public readonly title: string;
  public readonly artist: string;
  public readonly album?: string;
  public readonly releaseYear?: number;
  public durationSec: number;
  public readonly artworkUrl: string;
  public readonly artworkThumbUrl: string;
  public readonly previewUrl?: string;
  public readonly requestedBy: string;
  public readonly isManualRequest: boolean;
  public readonly requestType: RequestType;
  public readonly playlistId?: string;
  public readonly playlistTitle?: string;
  public readonly curatedBy: string;
  public readonly curationReason?: string;

  /** Resolved HTTP stream URL for audio decoding */
  public streamUrl?: string;
  /** In-memory 512KB prewarm buffer for instantaneous transition */
  public prewarmedBuffer?: Buffer;
  /** Epoch timestamp in seconds when this track started playing */
  public startedAtUnix?: number;

  constructor(opts: AudioTrackOptions) {
    this.id = opts.id;
    this.title = opts.title;
    this.artist = opts.artist;
    this.album = opts.album;
    this.releaseYear = opts.releaseYear;
    this.durationSec = opts.durationSec;
    this.artworkUrl = opts.artworkUrl || 'https://e-cdn-images.dzcdn.net/images/cover/d41d8cd98f00b204e9800998ecf8427e/1400x1400-000000-80-0-0.jpg';
    this.artworkThumbUrl = opts.artworkThumbUrl || 'https://e-cdn-images.dzcdn.net/images/cover/d41d8cd98f00b204e9800998ecf8427e/250x250-000000-80-0-0.jpg';
    this.previewUrl = opts.previewUrl;
    this.requestedBy = opts.requestedBy;
    this.isManualRequest = opts.isManualRequest;
    this.requestType = opts.requestType || (opts.isManualRequest ? 'single' : 'autoplay');
    this.playlistId = opts.playlistId;
    this.playlistTitle = opts.playlistTitle;
    this.curatedBy = opts.curatedBy || (opts.isManualRequest ? 'User Request' : 'Autoplay');
    this.curationReason = opts.curationReason;
  }

  /**
   * Factory method to create an AudioTrack from DeezerTrackMetadata.
   */
  public static fromDeezer(
    meta: DeezerTrackMetadata,
    requestedBy = 'autoplay_llm',
    isManualRequest = false,
    curatedBy = 'AI Room Mix',
    curationReason = '',
    requestType?: RequestType,
    playlistId?: string,
    playlistTitle?: string
  ): AudioTrack {
    return new AudioTrack({
      id: meta.id,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      releaseYear: meta.releaseYear,
      durationSec: meta.durationSec,
      artworkUrl: meta.artworkUrl,
      artworkThumbUrl: meta.artworkThumbUrl,
      previewUrl: meta.previewUrl,
      requestedBy,
      isManualRequest,
      requestType,
      playlistId,
      playlistTitle,
      curatedBy,
      curationReason,
    });
  }

  /**
   * Factory method converting YouTube metadata into an AudioTrack domain model.
   */
  public static fromYouTube(
    meta: {
      id: string;
      videoId: string;
      title: string;
      artist: string;
      album?: string;
      durationSec: number;
      artworkUrl: string;
      artworkThumbUrl: string;
    },
    requestedBy: string,
    isManualRequest: boolean,
    curatedBy = 'YouTube',
    curationReason?: string,
    requestType?: RequestType,
    playlistId?: string,
    playlistTitle?: string
  ): AudioTrack {
    return new AudioTrack({
      id: meta.id.startsWith('yt_') ? meta.id : `yt_${meta.id}`,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      durationSec: meta.durationSec,
      artworkUrl: meta.artworkUrl,
      artworkThumbUrl: meta.artworkThumbUrl,
      requestedBy,
      isManualRequest,
      requestType,
      playlistId,
      playlistTitle,
      curatedBy,
      curationReason,
    });
  }

  /**
   * Serialize for the lightweight /api/nowplaying endpoint (<600 bytes).
   */
  public toNowPlayingJson(elapsedSec: number) {
    const safeDuration = Math.max(1, this.durationSec);
    const progressPct = Math.min(100, Number(((elapsedSec / safeDuration) * 100).toFixed(1)));

    return {
      id: this.id,
      title: this.title,
      artist: this.artist,
      album: this.album || null,
      releaseYear: this.releaseYear || null,
      durationSec: this.durationSec,
      elapsedSec: Math.floor(elapsedSec),
      progressPct,
      startedAtUnix: this.startedAtUnix || Math.floor(Date.now() / 1000),
      artworkUrl: this.artworkUrl,
      artworkThumbUrl: this.artworkThumbUrl,
      requestedBy: this.requestedBy,
      isManualRequest: this.isManualRequest,
      requestType: this.requestType,
      playlistId: this.playlistId || null,
      playlistTitle: this.playlistTitle || null,
      curatedBy: this.curatedBy,
      curationReason: this.curationReason || null,
    };
  }

  /**
   * Serialize for the /api/queue listing.
   */
  public toQueueJson() {
    return {
      id: this.id,
      title: this.title,
      artist: this.artist,
      album: this.album || null,
      releaseYear: this.releaseYear || null,
      durationSec: this.durationSec,
      artworkThumbUrl: this.artworkThumbUrl,
      requestedBy: this.requestedBy,
      isManualRequest: this.isManualRequest,
      requestType: this.requestType,
      playlistId: this.playlistId || null,
      playlistTitle: this.playlistTitle || null,
      curatedBy: this.curatedBy,
      curationReason: this.curationReason || null,
    };
  }
}

export default AudioTrack;
