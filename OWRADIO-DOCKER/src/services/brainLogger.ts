/**
 * @file brainLogger.ts
 * @description Persistent telemetry and observability service for VEXO's AI Brain and Curation engine.
 * Records all prompts sent, responses received, inference durations, and taste interactions into SQLite.
 */

import { sqlite } from '../db/index.js';

export interface BrainLogEntry {
  id?: number;
  timestamp: number;
  model: string;
  action: 'curation' | 'vibe' | 'enrichment' | 'custom' | 'tier2_fallback' | 'vector_curation' | 'jev_decision' | 'taste_radar';
  prompt: string;
  response: string | null;
  durationMs: number;
  status: 'success' | 'timeout' | 'error' | 'fallback';
  metadata?: Record<string, any>;
}

export interface BrainStats {
  totalQueries: number;
  successCount: number;
  timeoutCount: number;
  avgDurationMs: number;
  lastInteractionAt: number | null;
}

/**
 * Persists an LLM or fallback interaction into SQLite brain_logs.
 */
export function logInteraction(entry: Omit<BrainLogEntry, 'id'>): void {
  try {
    const metaStr = entry.metadata ? JSON.stringify(entry.metadata) : null;
    sqlite.prepare(`
      INSERT INTO brain_logs (timestamp, model, action, prompt, response, duration_ms, status, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.timestamp,
      entry.model,
      entry.action,
      entry.prompt,
      entry.response,
      entry.durationMs,
      entry.status,
      metaStr
    );
  } catch (err) {
    console.warn('[BrainLogger] Error persisting brain log:', (err as Error).message);
  }
}

/**
 * Fetches recent brain interaction logs for the Web UI.
 */
export function getRecentLogs(limit = 40): BrainLogEntry[] {
  try {
    const rows = sqlite.prepare(`
      SELECT id, timestamp, model, action, prompt, response, duration_ms as durationMs, status, metadata_json
      FROM brain_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: number;
      timestamp: number;
      model: string;
      action: any;
      prompt: string;
      response: string | null;
      durationMs: number;
      status: any;
      metadata_json: string | null;
    }>;

    return rows.map((r) => ({
      ...r,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
    }));
  } catch (err) {
    console.warn('[BrainLogger] Error retrieving brain logs:', (err as Error).message);
    return [];
  }
}

/**
 * Computes high-level AI Brain telemetry metrics.
 */
export function getBrainStats(): BrainStats {
  try {
    const row = sqlite.prepare(`
      SELECT 
        COUNT(*) as totalQueries,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successCount,
        SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeoutCount,
        AVG(CASE WHEN status = 'success' THEN duration_ms ELSE NULL END) as avgDurationMs,
        MAX(timestamp) as lastInteractionAt
      FROM brain_logs
    `).get() as any;

    return {
      totalQueries: row?.totalQueries || 0,
      successCount: row?.successCount || 0,
      timeoutCount: row?.timeoutCount || 0,
      avgDurationMs: Math.round(row?.avgDurationMs || 0),
      lastInteractionAt: row?.lastInteractionAt || null,
    };
  } catch (err) {
    console.warn('[BrainLogger] Error computing brain stats:', (err as Error).message);
    return {
      totalQueries: 0,
      successCount: 0,
      timeoutCount: 0,
      avgDurationMs: 0,
      lastInteractionAt: null,
    };
  }
}

export default {
  logInteraction,
  getRecentLogs,
  getBrainStats,
};
