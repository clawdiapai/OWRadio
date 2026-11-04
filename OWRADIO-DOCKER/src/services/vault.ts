/**
 * @file vault.ts
 * @description Local Pre-Cached Offline Audio Vault for VEXO.
 * Stores frequent tracks locally in `./data/vault/` to achieve zero-latency 0.0s playback
 * and prevent redundant yt-dlp extractions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sqlite } from '../db/index.js';
import featureFlags from './featureFlags.js';

const VAULT_DIR = path.resolve(process.cwd(), 'data', 'vault');

export interface VaultStats {
  count: number;
  totalSizeBytes: number;
  formattedSize: string;
}

class AudioVaultService {
  private vaultDir: string = VAULT_DIR;
  private inFlightDownloads = new Set<string>();

  constructor() {
    this.ensureVaultDir();
    this.bootstrapTable();
  }

  private ensureVaultDir(): void {
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true });
    }
  }

  private bootstrapTable(): void {
    try {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS audio_vault (
          song_id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          play_count INTEGER NOT NULL DEFAULT 1,
          cached_at INTEGER NOT NULL
        );
      `);
    } catch (err) {
      console.error('[AudioVault] Table bootstrap error:', err);
    }
  }

  /**
   * Checks if a track exists in the local vault and is enabled.
   */
  public hasTrack(songId: string): boolean {
    if (!featureFlags.isEnabled('feature_offline_vault')) {
      return false;
    }
    const safeId = this.sanitizeId(songId);
    const candidatePath = path.join(this.vaultDir, `${safeId}.mp3`);
    return fs.existsSync(candidatePath) && fs.statSync(candidatePath).size > 10000;
  }

  /**
   * Returns absolute local file path for a cached track if available.
   */
  public getTrackPath(songId: string): string | null {
    if (!this.hasTrack(songId)) return null;
    const safeId = this.sanitizeId(songId);
    return path.join(this.vaultDir, `${safeId}.mp3`);
  }

  private sanitizeId(songId: string): string {
    return songId.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Record playback and auto-trigger vault pre-caching for frequent tracks (played >= 2 times).
   */
  public async maybePrecache(songId: string, youtubeUrlOrId?: string): Promise<void> {
    if (!featureFlags.isEnabled('feature_offline_vault')) return;
    if (this.hasTrack(songId) || this.inFlightDownloads.has(songId)) return;

    try {
      // Check play count in playback_history
      const row = sqlite.prepare(`
        SELECT COUNT(*) as playCount FROM playback_history WHERE song_id = ?
      `).get(songId) as { playCount: number } | undefined;

      const playCount = row?.playCount || 0;
      if (playCount >= 2 && youtubeUrlOrId) {
        console.log(`[AudioVault] 💾 Track "${songId}" played ${playCount} times. Pre-caching to Server Vault...`);
        this.cacheFromYouTube(songId, youtubeUrlOrId);
      }
    } catch (err) {
      console.warn('[AudioVault] maybePrecache check failed:', err);
    }
  }

  /**
   * Download track audio in the background directly into vault.
   */
  public async cacheFromYouTube(songId: string, youtubeUrlOrId: string): Promise<boolean> {
    if (this.hasTrack(songId) || this.inFlightDownloads.has(songId)) return true;
    this.inFlightDownloads.add(songId);

    const safeId = this.sanitizeId(songId);
    const outPath = path.join(this.vaultDir, `${safeId}.mp3`);
    const tempPath = `${outPath}.part`;

    const videoUrl = youtubeUrlOrId.startsWith('http')
      ? youtubeUrlOrId
      : `https://www.youtube.com/watch?v=${youtubeUrlOrId}`;

    return new Promise((resolve) => {
      const ytdlp = spawn('yt-dlp', [
        '-o', tempPath,
        '-f', 'bestaudio[acodec=opus]/bestaudio/18/best',
        '--no-playlist',
        '--no-warnings',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        videoUrl,
      ]);

      const timer = setTimeout(() => {
        ytdlp.kill();
        this.inFlightDownloads.delete(songId);
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
        resolve(false);
      }, 90000);

      ytdlp.on('close', (code) => {
        clearTimeout(timer);
        this.inFlightDownloads.delete(songId);

        if (code === 0 && fs.existsSync(tempPath)) {
          try {
            fs.renameSync(tempPath, outPath);
            const size = fs.statSync(outPath).size;
            const now = Math.floor(Date.now() / 1000);

            sqlite.prepare(`
              INSERT OR REPLACE INTO audio_vault (song_id, file_path, size_bytes, play_count, cached_at)
              VALUES (?, ?, ?, 1, ?)
            `).run(songId, outPath, size, now);

            console.log(`[AudioVault] ✅ Cached "${songId}" in Vault (${(size / 1024 / 1024).toFixed(2)} MB)`);
            resolve(true);
            return;
          } catch (err) {
            console.warn('[AudioVault] Failed to finalize cached file:', err);
          }
        }

        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
        resolve(false);
      });
    });
  }

  /**
   * Return vault storage statistics.
   */
  public getStats(): VaultStats {
    try {
      this.ensureVaultDir();
      const files = fs.readdirSync(this.vaultDir);
      let totalSize = 0;
      let count = 0;

      for (const file of files) {
        if (file.endsWith('.mp3')) {
          const stats = fs.statSync(path.join(this.vaultDir, file));
          totalSize += stats.size;
          count++;
        }
      }

      return {
        count,
        totalSizeBytes: totalSize,
        formattedSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      };
    } catch {
      return { count: 0, totalSizeBytes: 0, formattedSize: '0.00 MB' };
    }
  }

  /**
   * Clears all cached vault tracks.
   */
  public clear(): void {
    try {
      const files = fs.readdirSync(this.vaultDir);
      for (const file of files) {
        fs.unlinkSync(path.join(this.vaultDir, file));
      }
      sqlite.prepare('DELETE FROM audio_vault').run();
      console.log('[AudioVault] Cleared local audio vault.');
    } catch (err) {
      console.error('[AudioVault] Failed to clear vault:', err);
    }
  }
}

export const vault = new AudioVaultService();
export default vault;
