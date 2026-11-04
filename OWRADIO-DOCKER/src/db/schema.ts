/**
 * @file schema.ts
 * @description Drizzle ORM table schemas and index definitions for VEXO.
 * Target database: SQLite in WAL mode (better-sqlite3).
 */

import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Canonical song catalog with enriched metadata and artwork links.
 */
export const songs = sqliteTable('songs', {
  /** Unique canonical identifier: e.g. "dz_3135556" or "yt_dQw4w9WgXcQ" */
  id: text('id').primaryKey(),
  /** Deezer track ID if resolved via Deezer */
  deezerId: text('deezer_id').unique(),
  /** YouTube video ID if resolved */
  youtubeId: text('youtube_id'),
  /** Song title */
  title: text('title').notNull(),
  /** Primary artist name */
  artist: text('artist').notNull(),
  /** Artist identifier (e.g. Deezer artist ID) */
  artistId: text('artist_id'),
  /** Album title */
  album: text('album'),
  /** Track duration in seconds */
  durationSec: integer('duration_sec').notNull(),
  /** High-resolution artwork URL (1400x1400) */
  artworkUrl: text('artwork_url'),
  /** Low-overhead thumbnail artwork URL (250x250) for fast UI loading */
  artworkThumbUrl: text('artwork_thumb_url'),
  /** Primary genre string */
  genre: text('genre'),
  /** Year of release */
  releaseYear: integer('release_year'),
  /** Mood descriptor populated by Ollama gemma4:e2b */
  mood: text('mood'),
  /** Perceived energy level on a 1-10 scale populated by Ollama gemma4:e2b */
  energyLevel: integer('energy_level'),
  /** Serialized JSON array of semantic tags (e.g. ["synth-pop", "upbeat", "retro"]) */
  aiTagsJson: text('ai_tags_json'),
  /** Primary detected language code (e.g. "en", "fr", "es", "de") */
  detectedLanguage: text('detected_language'),
  /** Epoch timestamp in seconds when this record was created */
  createdAt: integer('created_at').notNull(),
});

/**
 * Playback log tracking every played track for the 48-hour anti-repetition guardrails.
 */
export const playbackHistory = sqliteTable(
  'playback_history',
  {
    /** Auto-incrementing primary key */
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Foreign key reference to songs.id */
    songId: text('song_id')
      .notNull()
      .references(() => songs.id),
    /** Denormalized artist name for rapid 2-hour artist cooldown lookups */
    artistName: text('artist_name').notNull(),
    /** Epoch timestamp in seconds when playback started */
    playedAt: integer('played_at').notNull(),
    /** Source of the request: Discord user ID, 'autoplay_llm', or 'autoplay_fallback' */
    requestedBy: text('requested_by').notNull(),
    /** True if queued manually by a user; manual requests bypass the 48h cooldown */
    isManualRequest: integer('is_manual_request', { mode: 'boolean' }).notNull(),
    /** Whether the track finished without being early-skipped */
    completed: integer('completed', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => ({
    playedAtIdx: index('idx_history_played_at').on(table.playedAt),
    songPlayedIdx: index('idx_history_song_played').on(table.songId, table.playedAt),
    artistPlayedIdx: index('idx_history_artist_played').on(table.artistName, table.playedAt),
  })
);

/**
 * User taste profile tracking affinities for songs, artists, and genres.
 */
export const userPreferences = sqliteTable(
  'user_preferences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Discord User ID */
    userId: text('user_id').notNull(),
    /** Preference target level: 'song' | 'artist' | 'genre' */
    targetType: text('target_type').notNull(),
    /** Canonical key: song.id, lowercase normalized artist name, or genre name */
    targetKey: text('target_key').notNull(),
    /** Human-readable display name for logging and UI */
    displayName: text('display_name').notNull(),
    /** Count of explicit /like command invocations */
    likes: integer('likes').notNull().default(0),
    /** Count of explicit /dislike command invocations */
    dislikes: integer('dislikes').notNull().default(0),
    /** Count of times a song by this entity was skipped when <35% elapsed */
    earlySkips: integer('early_skips').notNull().default(0),
    /** Count of natural full completions while the user was in the voice room */
    fullPlays: integer('full_plays').notNull().default(0),
    /** Calculated affinity: (likes * 3.0) + (fullPlays * 1.0) - (earlySkips * 1.5) - (dislikes * 4.0) */
    affinityScore: real('affinity_score').notNull().default(0),
    /** Epoch timestamp in seconds when this preference was last updated */
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    userTargetUnique: uniqueIndex('idx_user_target_unique').on(
      table.userId,
      table.targetType,
      table.targetKey
    ),
    userIdIdx: index('idx_pref_user_id').on(table.userId),
    affinityIdx: index('idx_pref_affinity').on(table.affinityScore),
  })
);

/**
 * Short-lived L2 cache for resolved audio stream URLs to minimize extraction latency and avoid rate limits.
 */
export const streamCache = sqliteTable('stream_cache', {
  /** Canonical song ID */
  songId: text('song_id').primaryKey(),
  /** YouTube video ID extracted */
  youtubeId: text('youtube_id').notNull(),
  /** Direct audio stream URL (valid until expiresAt) */
  streamUrl: text('stream_url').notNull(),
  /** Expiration timestamp in seconds (now + 3 hours) */
  expiresAt: integer('expires_at').notNull(),
});

/**
 * Known Discord users and listener identities.
 */
export const users = sqliteTable('users', {
  /** Discord User ID */
  id: text('id').primaryKey(),
  /** Discord username handle */
  username: text('username').notNull(),
  /** Server display name / nickname */
  displayName: text('display_name').notNull(),
  /** Discord avatar URL */
  avatarUrl: text('avatar_url'),
  /** Epoch timestamp in seconds when this profile was last seen */
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Permanently vetoed / blacklisted artists and songs.
 */
export const vetoedCatalog = sqliteTable('vetoed_catalog', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  targetType: text('target_type').notNull(), // 'artist' or 'song'
  targetKey: text('target_key').notNull(),
  displayName: text('display_name').notNull(),
  reason: text('reason').notNull().default('manual_admin'),
  createdAt: integer('created_at').notNull(),
});

/**
 * Track language classifications for foreign language anti-repetition cooldowns.
 */
export const trackLanguages = sqliteTable('track_languages', {
  dedupeKey: text('dedupe_key').primaryKey(),
  language: text('language').notNull(),
  confidence: real('confidence').notNull().default(1.0),
  source: text('source').notNull(),
  detectedAt: integer('detected_at').notNull(),
});

export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
export type TrackLanguageRow = typeof trackLanguages.$inferSelect;
export type NewTrackLanguage = typeof trackLanguages.$inferInsert;
export type PlaybackHistoryRow = typeof playbackHistory.$inferSelect;
export type NewPlaybackHistory = typeof playbackHistory.$inferInsert;
export type UserPreferenceRow = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
export type StreamCacheRow = typeof streamCache.$inferSelect;
export type NewStreamCache = typeof streamCache.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type VetoedCatalogRow = typeof vetoedCatalog.$inferSelect;
export type NewVetoedCatalog = typeof vetoedCatalog.$inferInsert;
