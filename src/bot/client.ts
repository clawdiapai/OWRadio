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
import deezer from '../services/deezer.js';
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
  clearCommand,
  removeCommand,
  shuffleCommand,
  replayCommand,
  statusCommand,
  historyCommand,
  volumeCommand,
  likeCommand,
  dislikeCommand,
  queueCommand,
  joinCommand,
  leaveCommand,
  handleSkip,
  handlePause,
  handleResume,
  handleStop,
  handleClear,
  handleRemove,
  handleShuffle,
  handleReplay,
  handleStatus,
  handleHistory,
  handleVolume,
  handleLike,
  handleDislike,
  handleQueue,
  handleJoin,
  handleLeave,
} from './commands/controls.js';

import {
  artistCommand,
  tasteCommand,
  throwbackCommand,
  radioCommand,
  morphCommand,
  vetoCommand,
  handleArtist,
  handleTaste,
  handleThrowback,
  handleRadio,
  handleMorph,
  handleVeto,
} from './commands/features.js';
import {
  filterCommand,
  handleFilterCommand,
  handleFilterButtonInteraction,
} from './commands/filter.js';

const ALL_COMMANDS = [
  playCommand,
  vibeCommand,
  joinCommand,
  leaveCommand,
  skipCommand,
  pauseCommand,
  resumeCommand,
  stopCommand,
  clearCommand,
  removeCommand,
  queueCommand,
  shuffleCommand,
  replayCommand,
  statusCommand,
  historyCommand,
  volumeCommand,
  likeCommand,
  dislikeCommand,
  artistCommand,
  tasteCommand,
  throwbackCommand,
  radioCommand,
  morphCommand,
  vetoCommand,
  filterCommand,
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

    // Handle Autocomplete for /play
    if (interaction.isAutocomplete() && interaction.commandName === 'play') {
      try {
        const focused = interaction.options.getFocused();
        if (!focused || focused.trim().length === 0) {
          await interaction.respond([]);
          return;
        }
        if (focused.startsWith('http://') || focused.startsWith('https://')) {
          await interaction.respond([{ name: `🔗 Link: ${focused}`.slice(0, 100), value: focused.slice(0, 100) }]);
          return;
        }
        const results = await deezer.searchTracks(focused, 5);
        await interaction.respond(
          results.map((t) => ({
            name: `🎵 ${t.title} - ${t.artist}`.slice(0, 100),
            value: `${t.artist} - ${t.title}`.slice(0, 100),
          }))
        );
      } catch {
        await interaction.respond([]).catch(() => {});
      }
      return;
    }

    // Handle StringSelectMenu for /remove
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_ui_remove_track') {
        const idx = parseInt(interaction.values[0], 10);
        if (isNaN(idx)) {
          await interaction.reply({ content: '❌ Invalid track selected.', ephemeral: true });
          return;
        }
        const removed = player.removeTrackAt(idx);
        if (removed) {
          await interaction.reply({
            content: `🗑️ Removed **${removed.title}** by **${removed.artist}** from queue.`,
            ephemeral: true,
          });
          playerUi.scheduleUpdate(false);
        } else {
          await interaction.reply({ content: '⚠️ Could not find track in queue.', ephemeral: true });
        }
        return;
      }
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

      if (customId === 'btn_ui_replay') {
        await handleReplay(interaction as any, player);
        playerUi.scheduleUpdate(false);
        return;
      }

      if (customId === 'btn_ui_shuffle') {
        await handleShuffle(interaction as any, player);
        playerUi.scheduleUpdate(false);
        return;
      }

      if (customId === 'btn_ui_like') {
        await handleLike(interaction as any, player);
        return;
      }

      if (customId === 'btn_ui_dislike') {
        await handleDislike(interaction as any, player);
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

      if (customId === 'btn_ui_queue') {
        await handleQueue(interaction as any, player);
        return;
      }

      if (customId === 'btn_ui_filter' || customId.startsWith('btn_toggle_filter_') || customId === 'btn_filter_recurate_now') {
        await handleFilterButtonInteraction(interaction as any, player);
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
        case 'veto':
          await handleVeto(interaction, player);
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
        case 'clear':
          await handleClear(interaction, player);
          break;
        case 'remove':
          await handleRemove(interaction, player);
          break;
        case 'shuffle':
          await handleShuffle(interaction, player);
          break;
        case 'replay':
          await handleReplay(interaction, player);
          break;
        case 'status':
          await handleStatus(interaction, player);
          break;
        case 'history':
          await handleHistory(interaction, player);
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
        case 'join':
          await handleJoin(interaction, player);
          break;
        case 'leave':
          await handleLeave(interaction, player);
          break;
        case 'filter':
          await handleFilterCommand(interaction, player);
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
