/**
 * @file client.ts
 * @description Discord Client initialization, guild-scoped slash command registration,
 * command routing, and voice room membership state listeners.
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  type Interaction,
  type VoiceState,
} from 'discord.js';
import config from '../config.js';
import { sqlite } from '../db/index.js';
import featureFlags from '../services/featureFlags.js';
import vectorCurator from '../services/vectorCurator.js';
import type { GuildPlayer } from '../player/GuildPlayer.js';
import { executeAutoResume } from './autoResume.js';
import playerUi from './playerUi.js';
import {
  playCommand,
  vibeCommand,
  handlePlay,
  handleVibe,
} from './commands/play.js';
import {
  skipCommand,
  pauseCommand,
  resumeCommand,
  stopCommand,
  volumeCommand,
  likeCommand,
  dislikeCommand,
  queueCommand,
  nowplayingCommand,
  joinCommand,
  leaveCommand,
  handleSkip,
  handlePause,
  handleResume,
  handleStop,
  handleVolume,
  handleLike,
  handleDislike,
  handleQueue,
  handleNowPlaying,
  handleJoin,
  handleLeave,
} from './commands/controls.js';

import {
  artistCommand,
  tasteCommand,
  throwbackCommand,
  radioCommand,
  morphCommand,
  vaultCommand,
  handleArtist,
  handleTaste,
  handleThrowback,
  handleRadio,
  handleMorph,
  handleVault,
} from './commands/features.js';

const ALL_COMMANDS = [
  playCommand,
  vibeCommand,
  joinCommand,
  leaveCommand,
  skipCommand,
  pauseCommand,
  resumeCommand,
  stopCommand,
  volumeCommand,
  likeCommand,
  dislikeCommand,
  queueCommand,
  nowplayingCommand,
  artistCommand,
  tasteCommand,
  throwbackCommand,
  radioCommand,
  morphCommand,
  vaultCommand,
];

export async function createDiscordBot(player: GuildPlayer): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
    ],
  });

  player.setDiscordClient(client);

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[DiscordBot] Logged in as ${readyClient.user.tag}`);

    // Initialize Minimal Sleek Auto-Updating Discord UI
    playerUi.init(readyClient, player);

    // 1. Trigger intelligent auto-resume on startup immediately (no /play command required)
    executeAutoResume(readyClient, player).catch((err) => {
      console.error('[DiscordBot] Auto-resume background task failed:', (err as Error).message);
    });

    // 2. Resolve primary guild: DEFAULT_GUILD_ID or first cached guild
    const guild = config.DEFAULT_GUILD_ID
      ? readyClient.guilds.cache.get(config.DEFAULT_GUILD_ID)
      : readyClient.guilds.cache.first();

    if (guild) {
      console.log(`[DiscordBot] Primary guild selected: "${guild.name}" (${guild.id})`);
      try {
        // Register slash commands directly to primary guild for 0-second propagation
        await guild.commands.set(ALL_COMMANDS.map((c) => c.toJSON()));
        console.log(`[DiscordBot] Successfully registered ${ALL_COMMANDS.length} slash commands to guild "${guild.name}"`);

        // Cache known guild members into users table non-blocking
        const members = guild.members.cache;
        const nowTs = Math.floor(Date.now() / 1000);
        const upsertUserStmt = sqlite.prepare(`
          INSERT OR REPLACE INTO users (id, username, display_name, avatar_url, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const [id, member] of members) {
          if (member.user.bot) continue;
          upsertUserStmt.run(
            id,
            member.user.username,
            member.displayName || member.user.globalName || member.user.username,
            member.user.displayAvatarURL() || null,
            nowTs
          );
        }
        console.log(`[DiscordBot] Synchronized ${members.size} cached guild members into users directory.`);
      } catch (err) {
        console.error('[DiscordBot] Guild setup error:', (err as Error).message);
      }
    } else {
      console.warn('[DiscordBot] No guild found in cache. Commands could not be registered to a primary guild.');
    }
  });

  // Handle Slash Command and Button Interactions
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    // Keep user identity fresh in users table
    if (interaction.user) {
      try {
        sqlite.prepare(`
          INSERT OR REPLACE INTO users (id, username, display_name, avatar_url, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          interaction.user.id,
          interaction.user.username,
          (interaction.member as any)?.displayName || interaction.user.globalName || interaction.user.username,
          interaction.user.displayAvatarURL() || null,
          Math.floor(Date.now() / 1000)
        );
      } catch {}
    }

    // Handle Button Interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // --- Minimal Sleek Player UI Controls ---
      if (customId === 'btn_ui_play_pause') {
        if (!player.currentTrack) {
          await interaction.reply({ content: '🔇 Nothing is currently playing.', ephemeral: true });
          return;
        }
        if (player.isPaused) {
          player.resume();
        } else {
          player.pause();
        }
        await interaction.deferUpdate().catch(() => {});
        playerUi.scheduleUpdate(false);
        return;
      }

      if (customId === 'btn_ui_skip') {
        if (!player.currentTrack) {
          await interaction.reply({ content: '🔇 Nothing is currently playing.', ephemeral: true });
          return;
        }
        player.skip(interaction.user.id);
        await interaction.deferUpdate().catch(() => {});
        playerUi.scheduleUpdate(false);
        return;
      }

      if (customId === 'btn_ui_like') {
        const current = player.currentTrack;
        if (!current) {
          await interaction.reply({ content: '🔇 Nothing is currently playing.', ephemeral: true });
          return;
        }
        try {
          const now = Math.floor(Date.now() / 1000);
          sqlite.prepare(`
            INSERT INTO user_preferences (user_id, target_type, target_key, display_name, likes, affinity_score, updated_at)
            VALUES (?, 'song', ?, ?, 1, 3.0, ?)
            ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
              likes = likes + 1,
              affinity_score = ((likes + 1) * 3.0) + (full_plays * 1.0) - (early_skips * 1.5) - (dislikes * 4.0),
              updated_at = ?
          `).run(interaction.user.id, current.id, current.title, now, now);
        } catch {}
        await interaction.reply({ content: `❤️ Saved **${current.title}** to your favorites! (+3.0 affinity)`, ephemeral: true });
        return;
      }

      if (customId === 'btn_ui_vibe') {
        // Preserve immediately primed Deck B so audio streaming is completely uninterrupted
        player.recurateAutoplayBuffer(true).catch((err) => {
          console.warn('[DiscordBot] Vibe recurate error:', (err as Error).message);
        });
        await interaction.reply({ content: '✨ Recurated upcoming queue to match active room vibe!', ephemeral: true });
        playerUi.scheduleUpdate();
        return;
      }

      if (customId === 'btn_ui_stop') {
        player.stop();
        await interaction.deferUpdate().catch(() => {});
        playerUi.scheduleUpdate(false);
        return;
      }

      if (customId.startsWith('btn_tune_')) {
        if (!featureFlags.isEnabled('feature_reaction_tuning')) {
          await interaction.reply({
            content: '⚠️ **Reaction-Driven Preference Tuning** is currently disabled in WebUI Settings.',
            ephemeral: true,
          });
          return;
        }
      }

      const current = player.currentTrack;
      const userId = interaction.user.id;
      const now = Math.floor(Date.now() / 1000);

      if (customId === 'btn_tune_fire' && current) {
        try {
          sqlite.prepare(`
            INSERT INTO user_preferences (user_id, target_type, target_key, display_name, likes, affinity_score, updated_at)
            VALUES (?, 'artist', ?, ?, 1, 4.0, ?)
            ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
              likes = likes + 1,
              affinity_score = ((likes + 1) * 3.0) + (full_plays * 1.0) - (early_skips * 1.5) - (dislikes * 4.0),
              updated_at = ?
          `).run(userId, current.artist.toLowerCase(), current.artist, now, now);
        } catch {}
        await interaction.reply({ content: `🔥 You hyped up **${current.title}** by **${current.artist}**! (+4.0 room affinity)`, ephemeral: true });
        return;
      }

      if (customId === 'btn_tune_like' && current) {
        try {
          sqlite.prepare(`
            INSERT INTO user_preferences (user_id, target_type, target_key, display_name, likes, affinity_score, updated_at)
            VALUES (?, 'song', ?, ?, 1, 3.0, ?)
            ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
              likes = likes + 1,
              affinity_score = ((likes + 1) * 3.0) + (full_plays * 1.0) - (early_skips * 1.5) - (dislikes * 4.0),
              updated_at = ?
          `).run(userId, current.id, current.title, now, now);
        } catch {}
        await interaction.reply({ content: `❤️ Added **${current.title}** to your favorites! (+3.0 affinity)`, ephemeral: true });
        return;
      }

      if (customId === 'btn_tune_chill' && current) {
        try {
          sqlite.prepare(`
            INSERT INTO user_preferences (user_id, target_type, target_key, display_name, full_plays, affinity_score, updated_at)
            VALUES (?, 'genre', 'chill', 'Chill / Downtempo', 1, 1.0, ?)
            ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
              full_plays = full_plays + 1,
              affinity_score = affinity_score + 1.0,
              updated_at = ?
          `).run(userId, now, now);
        } catch {}
        await interaction.reply({ content: `💤 Vibe tuned to chill & mellow! (+1.0 affinity)`, ephemeral: true });
        return;
      }

      if (customId === 'btn_tune_skip') {
        player.skip(userId);
        await interaction.reply({ content: `⏭️ Skipped current track.`, ephemeral: true });
        return;
      }

      if (customId === 'btn_vibe_steer_off') {
        vectorCurator.setVibeSteering('', null);
        await player.recurateAutoplayBuffer();
        await interaction.reply({
          content: '✨ **384-d Latent Vibe Steering Disengaged.** Autoplay buffer purged and restored to natural room listener consensus.',
          ephemeral: true,
        });
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.channelId) {
      playerUi.setBoundChannelId(interaction.channelId);
    }

    try {
      switch (interaction.commandName) {
        case 'play':
          await handlePlay(interaction, player);
          break;
        case 'vibe':
          await handleVibe(interaction, player);
          break;
        case 'artist':
          await handleArtist(interaction, player);
          break;
        case 'taste':
          await handleTaste(interaction, player);
          break;
        case 'throwback':
          await handleThrowback(interaction, player);
          break;
        case 'radio':
          await handleRadio(interaction, player);
          break;
        case 'morph':
          await handleMorph(interaction, player);
          break;
        case 'vault':
          await handleVault(interaction, player);
          break;
        case 'skip':
          await handleSkip(interaction, player);
          break;
        case 'pause':
          await handlePause(interaction, player);
          break;
        case 'resume':
          await handleResume(interaction, player);
          break;
        case 'stop':
          await handleStop(interaction, player);
          break;
        case 'volume':
          await handleVolume(interaction, player);
          break;
        case 'like':
          await handleLike(interaction, player);
          break;
        case 'dislike':
          await handleDislike(interaction, player);
          break;
        case 'queue':
          await handleQueue(interaction, player);
          break;
        case 'nowplaying':
          await handleNowPlaying(interaction, player);
          break;
        case 'join':
          await handleJoin(interaction, player);
          break;
        case 'leave':
          await handleLeave(interaction, player);
          break;
        default:
          console.warn(`[DiscordBot] Unrecognized command: ${interaction.commandName}`);
      }
    } catch (err) {
      console.error(`[DiscordBot] Error handling /${interaction.commandName}:`, (err as Error).message);
      const replyFn = interaction.deferred ? interaction.editReply.bind(interaction) : interaction.reply.bind(interaction);
      await replyFn({ content: '❌ An error occurred executing this command.' }).catch(() => {});
    } finally {
      // Reposition now playing UI at the very bottom of the channel below the command output
      setTimeout(() => {
        playerUi.repositionToBottom();
      }, 500);
    }
  });

  // Handle Voice Channel Membership Updates with 8-second Debounce
  let membershipDebounceTimer: NodeJS.Timeout | null = null;

  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    // Ignore bot voice state updates
    if (oldState.member?.user.bot || newState.member?.user.bot) return;

    // Check if voice channel changed
    if (oldState.channelId !== newState.channelId) {
      const activeChannelUserIds = player.getActiveListenerUserIds();
      // If someone joined or left the bot's current voice channel
      const isAffected =
        (oldState.channel && activeChannelUserIds.includes(oldState.member?.id || '')) ||
        (newState.channel && activeChannelUserIds.includes(newState.member?.id || ''));

      if (isAffected) {
        console.log(`[DiscordBot] Listener room transition: ${oldState.member?.displayName || 'User'} moved channels. Debouncing room re-curation (8s)...`);
        if (membershipDebounceTimer) {
          clearTimeout(membershipDebounceTimer);
        }
        membershipDebounceTimer = setTimeout(async () => {
          membershipDebounceTimer = null;
          await player.handleVoiceRoomMembershipChange();
        }, 8000);
      }
    }
  });

  return client;
}

export default createDiscordBot;
