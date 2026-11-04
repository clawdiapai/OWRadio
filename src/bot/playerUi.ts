/**
 * @file playerUi.ts
 * @description Minimal, sleek, and highly functional Discord Now Playing UI.
 * Features:
 * - Auto-updates on every song change, crossfade, and state transition.
 * - Always stays as the bottom-most (last sent) message in the playing channel.
 * - In-place editing when already at the bottom to prevent chat bounce/spam.
 * - Debounced repositioning when users send messages in the channel.
 * - Sleek, dark interactive controls (Play/Pause, Skip, Like, Vibe, Stop).
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type TextBasedChannel,
  type Message,
  type VoiceBasedChannel,
  Events,
} from 'discord.js';
import type { GuildPlayer, PlayerStatePayload } from '../player/GuildPlayer.js';
import { getBotState, setBotState, sqlite } from '../db/index.js';
import featureFlags from '../services/featureFlags.js';
import stationCurator from '../services/stationCurator.js';
import dynamicSettings from '../services/dynamicSettings.js';

function formatDuration(sec: number): string {
  if (sec <= 0 || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function buildProgressBar(elapsedSec: number, durationSec: number, totalSegments = 12): string {
  if (durationSec <= 0 || isNaN(durationSec)) {
    return '🔘' + '▬'.repeat(totalSegments);
  }
  const ratio = Math.max(0, Math.min(1, elapsedSec / durationSec));
  const pos = Math.round(ratio * totalSegments);
  const left = '▬'.repeat(Math.max(0, pos));
  const right = '▬'.repeat(Math.max(0, totalSegments - pos));
  return `${left}🔘${right}`;
}

export class PlayerUiService {
  private client: Client | null = null;
  private player: GuildPlayer | null = null;
  private boundChannelId: string | null = null;
  private currentMessageId: string | null = null;
  private isUpdating = false;
  private updateQueued = false;
  private messageDebounceTimer: NodeJS.Timeout | null = null;
  private progressInterval: NodeJS.Timeout | null = null;
  private lastResendTimestamp = 0;

  public init(client: Client, player: GuildPlayer): void {
    this.client = client;
    this.player = player;

    // Restore last bound UI channel from persistent storage
    this.boundChannelId = getBotState('last_ui_channel_id', '') || null;

    // Listen to player state changes (song start, finish, skip, pause, resume)
    this.player.on('stateChange', () => {
      this.scheduleUpdate(false);
    });

    // Listen to incoming messages in Discord to guarantee the UI is ALWAYS the last message
    this.client.on(Events.MessageCreate, (message: Message) => {
      this.handleIncomingMessage(message);
    });

    // Start a periodic progress ticker to keep progress bar and elapsed time fresh
    this.startProgressTicker();

    // Listen to dynamic settings changes for real-time reactivity
    dynamicSettings.on('change:discord_ui_update_interval_sec', () => {
      this.startProgressTicker();
    });
    dynamicSettings.on('change:discord_sticky_ui_enabled', (enabled: boolean) => {
      if (!enabled) {
        this.clearStickyMessage();
      } else {
        this.scheduleUpdate(true);
      }
    });

    console.log('[PlayerUi] ✨ Minimal Sleek Discord UI service initialized.');
  }

  /**
   * Sets the channel where the UI should be rendered.
   * Persists to SQLite for seamless auto-resume across bot restarts.
   */
  public setBoundChannelId(channelId: string): void {
    if (this.boundChannelId !== channelId) {
      this.boundChannelId = channelId;
      setBotState('last_ui_channel_id', channelId);
      // Clean up previous message reference if channel switched
      this.currentMessageId = null;
    }
  }

  public getBoundChannelId(): string | null {
    return this.boundChannelId;
  }

  /**
   * Resolves the target text-based channel where the UI should be sent.
   * Priority: boundChannelId -> active voice channel (built-in text chat) -> last voice channel -> first available guild text channel.
   */
  private async resolveChannel(): Promise<TextBasedChannel | null> {
    if (!this.client) {
      console.warn('[PlayerUi] Cannot resolve channel: Discord client is null.');
      return null;
    }

    // 1. Try bound channel
    if (this.boundChannelId) {
      try {
        const ch = await this.client.channels.fetch(this.boundChannelId).catch(() => null);
        if (ch && ch.isTextBased()) {
          return ch as TextBasedChannel;
        }
      } catch (e) {
        console.warn(`[PlayerUi] Bound channel ${this.boundChannelId} fetch error: ${(e as Error).message}`);
      }
    }

    // 2. Fall back to the active voice channel's text chat
    const voiceChannel = this.player?.getActiveVoiceChannel();
    if (voiceChannel) {
      try {
        if (voiceChannel.isTextBased()) {
          this.setBoundChannelId(voiceChannel.id);
          return voiceChannel as unknown as TextBasedChannel;
        }
      } catch (e) {
        console.warn(`[PlayerUi] Active voice channel text chat error: ${(e as Error).message}`);
      }
    }

    // 3. Fall back to stored voice channel
    const lastVoiceId = getBotState('last_voice_channel_id', '');
    if (lastVoiceId) {
      try {
        const ch = await this.client.channels.fetch(lastVoiceId).catch(() => null);
        if (ch && ch.isTextBased()) {
          this.setBoundChannelId(ch.id);
          return ch as TextBasedChannel;
        }
      } catch {}
    }

    // 4. Fall back to any text channel in primary guild
    const guild = this.client.guilds.cache.first();
    if (guild) {
      const textCh = guild.channels.cache.find(
        (c) => c.isTextBased() && (c.name.includes('music') || c.name.includes('bot') || c.name.includes('chat') || c.name.includes('general'))
      ) || guild.channels.cache.find((c) => c.isTextBased() && !c.isVoiceBased());

      if (textCh && textCh.isTextBased()) {
        this.setBoundChannelId(textCh.id);
        console.log(`[PlayerUi] Target channel resolved from guild text channel fallback: "${(textCh as any).name}" (${textCh.id})`);
        return textCh as TextBasedChannel;
      }
    }

    console.warn('[PlayerUi] Could not resolve any text-based channel for UI.');
    return null;
  }

  /**
   * Schedules an update with concurrency protection.
   * Edits the existing message in place whenever possible.
   */
  public scheduleUpdate(forceResend = false): void {
    if (forceResend) {
      this.repositionToBottom().catch(() => {});
      return;
    }
    if (this.isUpdating) {
      this.updateQueued = true;
      return;
    }

    this.updateUi(false).catch((err) => {
      console.warn('[PlayerUi] Error during UI update:', (err as Error).message);
    });
  }

  /**
   * Handles user chat messages in the bound channel.
   * Strictly filters out bots/webhooks to prevent infinite loops, debounces rapid typing,
   * and repositions the UI cleanly to the bottom.
   */
  private handleIncomingMessage(message: Message): void {
    // 1. CRITICAL: Strictly ignore all bots, webhooks, and our own client messages
    if (message.author.bot || message.webhookId || message.author.id === this.client?.user?.id) {
      return;
    }

    if (!dynamicSettings.getBoolean('discord_sticky_ui_enabled', true)) return;
    if (!this.player?.currentTrack) return;

    // 2. Only handle messages in the active bound UI channel
    if (!this.boundChannelId || message.channelId !== this.boundChannelId) {
      return;
    }

    // 3. Ignore our own UI message
    if (message.id === this.currentMessageId) return;

    // 4. Debounce: if a user types multiple messages, reset timer
    // so we only perform ONE reposition after they pause typing.
    const debounceMs = dynamicSettings.getNumber('discord_ui_debounce_ms', 1200);
    if (this.messageDebounceTimer) {
      clearTimeout(this.messageDebounceTimer);
    }
    this.messageDebounceTimer = setTimeout(() => {
      this.messageDebounceTimer = null;
      this.repositionToBottom();
    }, debounceMs);
  }

  /**
   * Repositions the UI message to the very bottom of the channel.
   * Only deletes/re-sends if the message is NOT already the latest message in the channel.
   * Includes a cooldown guard to prevent rapid delete/re-sends.
   */
  public async repositionToBottom(): Promise<void> {
    if (!this.player?.currentTrack || !this.client) return;

    const channel = await this.resolveChannel();
    if (!channel) return;

    // Check if our message is ALREADY the latest message in the channel
    if (this.currentMessageId) {
      try {
        const recent = await channel.messages.fetch({ limit: 1 }).catch(() => null);
        const latest = recent?.first();
        if (latest && latest.id === this.currentMessageId) {
          // Already at the bottom! Just edit in place.
          await this.updateUi(false);
          return;
        }
      } catch {}
    }

    // Rate-limit guard: Never delete & resend faster than once every 2 seconds
    const now = Date.now();
    if (now - this.lastResendTimestamp < 2000) {
      if (!this.messageDebounceTimer) {
        this.messageDebounceTimer = setTimeout(() => {
          this.messageDebounceTimer = null;
          this.repositionToBottom();
        }, 2000);
      }
      return;
    }

    await this.updateUi(true);
  }

  /**
   * Main render method.
   * If already at the bottom of the channel, edits the message in place.
   * If other messages have been posted below it (or forceResend is true), posts at bottom and deletes old message.
   */
  public async updateUi(forceResend = false): Promise<void> {
    if (!this.player || !this.client) return;
    if (this.isUpdating) {
      this.updateQueued = true;
      return;
    }
    this.isUpdating = true;

    try {
      const channel = await this.resolveChannel();
      if (!channel) {
        console.warn('[PlayerUi] Skipping updateUi: No channel resolved.');
        return;
      }

      const state = this.player.getStatePayload();
      const track = state.track;

      // Check if sticky UI is disabled via dynamic settings
      if (!dynamicSettings.getBoolean('discord_sticky_ui_enabled', true)) {
        await this.clearStickyMessage();
        return;
      }

      // Case 1: Player is idle / stopped
      if (!track || !this.player.currentTrack) {
        await this.clearStickyMessage();
        return;
      }

      // Case 2: Active playback -> Build minimal sleek embed & buttons
      const { embed, components } = this.buildUiPayload(state);

      // Check if our message is already the last message in the channel
      let isAlreadyLast = false;
      if (this.currentMessageId) {
        try {
          const recent = await channel.messages.fetch({ limit: 1 }).catch(() => null);
          const latest = recent?.first();
          if (latest && latest.id === this.currentMessageId) {
            isAlreadyLast = true;
          }
        } catch {}
      }

      // If it is already the last message (and forceResend is not explicitly requested),
      // or if forceResend was requested BUT no other message was sent below it:
      // EDIT IN PLACE (zero delete, zero resend, zero flicker, zero scroll bounce!)
      if (isAlreadyLast && this.currentMessageId) {
        try {
          const msg = await channel.messages.fetch(this.currentMessageId).catch(() => null);
          if (msg) {
            await msg.edit({ embeds: [embed], components });
            return;
          }
        } catch {
          // If edit fails (e.g. message was manually deleted by someone), fall through to send fresh
        }
      }

      // It is NOT the last message (someone chatted below it, or command was run)
      // Send the fresh message at the bottom FIRST
      const oldId = this.currentMessageId;
      const newMsg = await (channel as any).send({ embeds: [embed], components });
      this.currentMessageId = newMsg.id;
      this.lastResendTimestamp = Date.now();
      console.log(`[PlayerUi] 🎵 Now Playing UI rendered at channel bottom (msgId: ${newMsg.id}, channel: ${(channel as any).name || channel.id})`);

      // Safely delete the old message in the background
      if (oldId && oldId !== newMsg.id) {
        channel.messages.fetch(oldId)
          .then((oldMsg) => oldMsg?.delete().catch(() => {}))
          .catch(() => {});
      }
    } catch (err) {
      console.warn('[PlayerUi] Failed to render UI message:', (err as Error).message);
    } finally {
      this.isUpdating = false;
      if (this.updateQueued) {
        this.updateQueued = false;
        setTimeout(() => this.scheduleUpdate(), 300);
      }
    }
  }

  /**
   * Generates the minimal sleek embed and interactive action row.
   */
  private buildUiPayload(state: PlayerStatePayload): {
    embed: EmbedBuilder;
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    const track = state.track!;
    const isPaused = this.player?.isPaused ?? false;

    // Theme color based on curation mode
    let themeColor = 0x5865f2; // Default Blurple
    let modeBadge = '⚡ Hi-Fi Stream';

    if (state.radioStation) {
      themeColor = 0x3498db; // Sky Blue
      modeBadge = `📻 Station • ${state.radioStation.name}`;
    } else if (state.timeCapsuleYear) {
      themeColor = 0xf1c40f; // Gold
      modeBadge = `⏳ Time Capsule • ${state.timeCapsuleYear}`;
    } else if (state.morph?.active) {
      themeColor = 0xe91e63; // Magenta
      modeBadge = `🌀 DJ Morph • Step ${state.morph.step}/${state.morph.totalSteps}`;
    } else if (track.curatedBy === 'AI Vibe Mix') {
      themeColor = 0x9b59b6; // Purple
      modeBadge = '✨ AI Vibe Mix';
    } else if (track.curatedBy === 'User Request' || track.isManualRequest) {
      if (track.requestType === 'playlist') {
        themeColor = 0x3498db; // Sky Blue
        modeBadge = track.playlistTitle ? `📋 ${track.playlistTitle}` : '📋 Blended Playlist';
      } else {
        themeColor = 0x2ecc71; // Emerald Green
        modeBadge = '⭐ VIP Single Request';
      }
    }

    const elapsed = track.elapsedSec || 0;
    const duration = track.durationSec || 0;
    const bar = buildProgressBar(elapsed, duration, 12);
    const timeDisplay = `\`${formatDuration(elapsed)}\` ${bar} \`${formatDuration(duration)}\``;

    // Format listeners
    const listenerNames = state.roomListeners.length > 0
      ? state.roomListeners.slice(0, 3).join(', ') + (state.roomListeners.length > 3 ? ` +${state.roomListeners.length - 3}` : '')
      : 'Solo';

    // Format up next
    let upNextTag = '';
    if (state.upNext) {
      if (state.upNext.requestType === 'single') {
        upNextTag = ' `⭐ VIP`';
      } else if (state.upNext.requestType === 'playlist') {
        upNextTag = ' `📋 Blend`';
      }
    }

    const upNextText = state.upNext
      ? `**${state.upNext.title}** by *${state.upNext.artist}*${upNextTag}`
      : '*(Dynamic Autoplay Consensus)*';

    const embed = new EmbedBuilder()
      .setColor(themeColor)
      .setAuthor({
        name: `${isPaused ? '⏸️ PAUSED' : '🟢 NOW PLAYING'} • ${modeBadge}`,
        iconURL: this.client?.user?.displayAvatarURL() || undefined,
      })
      .setTitle(`🎶 ${track.title}`)
      .setURL(state.streamUrl && state.streamUrl.startsWith('http') ? state.streamUrl : null)
      .setDescription(
        `### **${track.artist}**${track.album ? ` • *${track.album}*` : ''}\n\n` +
        `${timeDisplay}\n\n` +
        `> ⏭️ **Up Next:** ${upNextText}\n` +
        `> 🎧 **Listeners:** ${listenerNames} • 🔊 **Vol:** \`${state.volume}%\`` +
        (track.curationReason ? `\n> 💡 *${track.curationReason}*` : '')
      )
      .setFooter({
        text: `VEXO 2.0 • 384-d JEPA Latent Audio • Queue: ${state.queueLength} tracks`,
      });

    if (track.artworkUrl) {
      embed.setThumbnail(track.artworkUrl);
    }

    // 5 Minimal Sleek Control Buttons (fits in 1 ActionRow)
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_ui_play_pause')
        .setEmoji(isPaused ? '▶️' : '⏸️')
        .setLabel(isPaused ? 'Resume' : 'Pause')
        .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_ui_skip')
        .setEmoji('⏭️')
        .setLabel('Skip')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_ui_like')
        .setEmoji('❤️')
        .setLabel('Like')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_ui_vibe')
        .setEmoji('✨')
        .setLabel('Vibe')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_ui_queue')
        .setEmoji('📋')
        .setLabel('Queue')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embed, components: [row] };
  }

  /**
   * Cleans up the existing sticky UI message from the Discord channel.
   */
  public async clearStickyMessage(): Promise<void> {
    if (!this.currentMessageId) return;
    const oldId = this.currentMessageId;
    this.currentMessageId = null;
    const channel = await this.resolveChannel();
    if (channel) {
      try {
        const oldMsg = await channel.messages.fetch(oldId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
        console.log('[PlayerUi] Cleaned up Now Playing message.');
      } catch {}
    }
  }

  /**
   * Periodic ticker to smoothly update elapsed time on the progress bar.
   * Dynamic update interval configurable via settings (5s to 60s).
   */
  public startProgressTicker(): void {
    if (this.progressInterval) clearInterval(this.progressInterval);
    const intervalSec = dynamicSettings.getNumber('discord_ui_update_interval_sec', 15);
    this.progressInterval = setInterval(() => {
      if (this.player?.currentTrack && !this.player.isPaused) {
        this.scheduleUpdate(false);
      }
    }, intervalSec * 1000);
  }

  /**
   * Cleans up resources on shutdown.
   */
  public destroy(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    if (this.messageDebounceTimer) {
      clearTimeout(this.messageDebounceTimer);
      this.messageDebounceTimer = null;
    }
  }
}

export const playerUi = new PlayerUiService();
export default playerUi;
