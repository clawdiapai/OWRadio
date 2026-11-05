/**
 * @file controls.ts
 * @description Discord slash commands for player controls:
 * /skip, /pause, /resume, /stop, /clear, /remove, /queue, /shuffle, /replay, /status, /history, /like, /dislike, /volume, /join, /leave.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  type GuildMember,
} from 'discord.js';
import type { GuildPlayer } from '../../player/GuildPlayer.js';
import { sqlite } from '../../db/index.js';
import vetoService from '../../services/vetoService.js';
import dynamicSettings from '../../services/dynamicSettings.js';

// --- Unified /control Master Command (Option C) ---
export const controlCommand = new SlashCommandBuilder()
  .setName('control')
  .setDescription('Player and queue playback controls')
  .addSubcommand((sub) => sub.setName('skip').setDescription('Skip the currently playing track'))
  .addSubcommand((sub) => sub.setName('pause').setDescription('Pause current playback'))
  .addSubcommand((sub) => sub.setName('resume').setDescription('Resume paused playback'))
  .addSubcommand((sub) => sub.setName('replay').setDescription('Replay current track from the beginning'))
  .addSubcommand((sub) => sub.setName('queue').setDescription('View upcoming curated queue (ephemeral)'))
  .addSubcommand((sub) => sub.setName('clear').setDescription('Clear upcoming tracks from queue (Admin only)'))
  .addSubcommand((sub) => sub.setName('shuffle').setDescription('Shuffle upcoming tracks in queue'))
  .addSubcommand((sub) => sub.setName('remove').setDescription('Interactive picker to remove a song from queue'))
  .addSubcommand((sub) => sub.setName('status').setDescription('View bot ping, stream latency, and uptime'))
  .addSubcommand((sub) => sub.setName('history').setDescription('View recently played songs'))
  .addSubcommand((sub) => sub.setName('like').setDescription('Like current track to boost its style in room taste'))
  .addSubcommand((sub) => sub.setName('dislike').setDescription('Dislike current track (3 room dislikes triggers auto-veto)'))
  .addSubcommand((sub) =>
    sub
      .setName('volume')
      .setDescription('Set playback volume 1-100 (Admin only)')
      .addIntegerOption((opt) =>
        opt
          .setName('percent')
          .setDescription('Volume level between 1 and 100')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100)
      )
  );

export const skipCommand = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Skip the currently playing track');

export const pauseCommand = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pause current playback');

export const resumeCommand = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Resume paused playback');

export const stopCommand = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop playback and clear the queue (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export const clearCommand = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Clear upcoming tracks from the queue without stopping current song (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export const removeCommand = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove a song from the queue with an interactive picker');

export const queueCommand = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('View the upcoming curated queue (ephemeral, zero chat spam)');

export const shuffleCommand = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('Shuffle upcoming tracks in the queue');

export const replayCommand = new SlashCommandBuilder()
  .setName('replay')
  .setDescription('Replay the currently playing track from the beginning');

export const statusCommand = new SlashCommandBuilder()
  .setName('status')
  .setDescription('View bot ping, stream latency, uptime, and broadcast status');

export const historyCommand = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View recently played songs');

export const volumeCommand = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Set playback volume 1-100 (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addIntegerOption((opt) =>
    opt
      .setName('percent')
      .setDescription('Volume level between 1 and 100')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  );

export const likeCommand = new SlashCommandBuilder()
  .setName('like')
  .setDescription('Like the current track to favor this style in room recommendations');

export const dislikeCommand = new SlashCommandBuilder()
  .setName('dislike')
  .setDescription('Dislike track (3 community dislikes in room triggers auto-veto)');

export const joinCommand = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Summon the bot to your current voice channel');

export const leaveCommand = new SlashCommandBuilder()
  .setName('leave')
  .setDescription('Disconnect the bot from voice (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

/**
 * Handle /join
 */
export async function handleJoin(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const member = interaction.member as GuildMember;
  const targetChannel = member?.voice?.channel;
  if (!targetChannel) {
    await interaction.reply({ content: '❌ You must be inside a voice channel to use /join!', ephemeral: true });
    return;
  }

  const currentChannel = player.getActiveVoiceChannel();
  if (currentChannel && currentChannel.id !== targetChannel.id) {
    const activeListeners = player.getActiveListenerUserIds();
    const isBotAlone = activeListeners.length === 0;

    const hasAdminPerm =
      member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isBotAlone && !hasAdminPerm) {
      await interaction.reply({
        content: `❌ The bot is currently playing in **${currentChannel.name}**. Only Mods/Admins can move it to another channel.`,
        ephemeral: true,
      });
      return;
    }
  }

  await interaction.deferReply({ ephemeral: true });
  await player.connectToVoice(targetChannel);
  await interaction.editReply(`🔊 Joined voice channel **${targetChannel.name}**!`);
}

/**
 * Handle /leave
 */
export async function handleLeave(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  player.disconnectVoice();
  await interaction.reply({ content: '👋 Disconnected from voice channel.', ephemeral: true });
}

/**
 * Handle /skip (Silent/ephemeral to eliminate chat clutter)
 */
export async function handleSkip(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  if (!player.currentTrack) {
    await interaction.reply({ content: '❌ Nothing is currently playing!', ephemeral: true });
    return;
  }

  player.skip(interaction.user.id);
  await interaction.reply({ content: '⏭️ Skipped track.', ephemeral: true });
}

/**
 * Handle /pause
 */
export async function handlePause(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const success = player.pause();
  await interaction.reply({
    content: success ? '⏸️ Playback paused.' : '❌ Playback is already paused or idle.',
    ephemeral: true,
  });
}

/**
 * Handle /resume
 */
export async function handleResume(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const success = player.resume();
  await interaction.reply({
    content: success ? '▶️ Playback resumed.' : '❌ Playback is already playing or idle.',
    ephemeral: true,
  });
}

/**
 * Handle /stop
 */
export async function handleStop(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  player.stop();
  await interaction.reply({ content: '⏹️ Playback stopped and queue cleared.', ephemeral: true });
}

/**
 * Handle /clear (queue clear only)
 */
export async function handleClear(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  player.clearUpcomingQueue();
  await interaction.reply({ content: '🧹 Upcoming queue cleared. Autoplay buffer will replenish.', ephemeral: true });
}

/**
 * Handle /remove (interactive selector)
 */
export async function handleRemove(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const queue = player.getQueueList();
  if (queue.length === 0) {
    await interaction.reply({ content: '📭 The queue is currently empty.', ephemeral: true });
    return;
  }

  const options = queue.slice(0, 10).map((t, idx) => ({
    label: `${idx + 1}. ${t.title.slice(0, 60)}`,
    description: t.artist.slice(0, 50),
    value: String(idx),
  }));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_ui_remove_track')
      .setPlaceholder('Choose a song to remove from the queue...')
      .addOptions(options)
  );

  await interaction.reply({
    content: '🗑️ **Select an upcoming song to remove:**',
    components: [row],
    ephemeral: true,
  });
}

/**
 * Handle /queue (ephemeral, zero spam)
 */
export async function handleQueue(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  player: GuildPlayer
): Promise<void> {
  const current = player.currentTrack;
  const queue = player.getQueueList();

  if (!current && queue.length === 0) {
    await interaction.reply({ content: '📭 The queue is currently empty.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🎶 OWRadio Playback Queue');

  if (current) {
    const elapsedSec = current.startedAtUnix ? Math.floor(Date.now() / 1000 - current.startedAtUnix) : 0;
    const progressMin = Math.floor(elapsedSec / 60);
    const progressSec = String(elapsedSec % 60).padStart(2, '0');
    const totalMin = Math.floor(current.durationSec / 60);
    const totalSec = String(current.durationSec % 60).padStart(2, '0');

    embed.setDescription(
      `**Now Playing:**\n**${current.title}** by **${current.artist}**\n` +
        `⏱️ \`${progressMin}:${progressSec} / ${totalMin}:${totalSec}\` | Curated by: \`${current.curatedBy}\``
    );
    embed.setThumbnail(current.artworkThumbUrl);
  }

  if (queue.length > 0) {
    const lines = queue.slice(0, 10).map((t, idx) => {
      const min = Math.floor(t.durationSec / 60);
      const sec = String(t.durationSec % 60).padStart(2, '0');
      const tag = t.requestType === 'single' ? '⭐ VIP' : t.curatedBy;
      return `\`${idx + 1}.\` **${t.title}** - ${t.artist} (\`${min}:${sec}\`) [${tag}]`;
    });

    if (queue.length > 10) {
      lines.push(`*...and ${queue.length - 10} more upcoming tracks*`);
    }

    embed.addFields({ name: 'Up Next', value: lines.join('\n') });
  }

  // Admin Queue Pop Selector
  const member = interaction.member as GuildMember;
  const hasAdminPerm =
    member?.permissions &&
    (member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      member.permissions.has(PermissionFlagsBits.Administrator));

  if (hasAdminPerm && queue.length > 0) {
    const options = queue.slice(0, 25).map((t, idx) => ({
      label: `${idx + 1}. ${t.title}`.slice(0, 100),
      description: `${t.artist} (${Math.floor(t.durationSec / 60)}:${String(t.durationSec % 60).padStart(2, '0')})`.slice(0, 100),
      value: String(idx),
    }));

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_ui_remove_track')
        .setPlaceholder('🗑️ Select a song to pop/remove from queue...')
        .addOptions(options)
    );

    await interaction.reply({ embeds: [embed], components: [selectRow], ephemeral: true });
    return;
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /shuffle
 */
export async function handleShuffle(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const count = player.shuffleQueue();
  await interaction.reply({ content: `🔀 Shuffled **${count} tracks** in the queue.`, ephemeral: true });
}

/**
 * Handle /replay
 */
export async function handleReplay(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  if (!player.currentTrack) {
    await interaction.reply({ content: '❌ Nothing is currently playing!', ephemeral: true });
    return;
  }
  player.replay();
  await interaction.reply({ content: '🔄 Replaying current track from 0:00.', ephemeral: true });
}

/**
 * Handle /status
 */
export async function handleStatus(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const uptimeSec = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = uptimeSec % 60;
  const ping = interaction.client.ws.ping;
  const state = player.getStatePayload();
  const bitrate = dynamicSettings.getNumber('audio_mp3_bitrate_kbps', 192);

  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('⚡ OWRadio Broadcast & Engine Status')
    .addFields(
      { name: 'Gateway Ping', value: `\`${ping}ms\``, inline: true },
      { name: 'Server Uptime', value: `\`${hours}h ${minutes}m ${seconds}s\``, inline: true },
      { name: 'Audio Bitrate', value: `\`${bitrate} kbps\``, inline: true },
      { name: 'Active Listeners', value: `\`${state.roomListeners.length} users\``, inline: true },
      { name: 'Queue Depth', value: `\`${state.queueLength} tracks\``, inline: true },
      { name: 'Volume Level', value: `\`${state.volume}%\``, inline: true }
    )
    .setFooter({ text: 'OWRadio Autonomous Audio Engine' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle /history
 */
export async function handleHistory(
  interaction: ChatInputCommandInteraction,
  _player: GuildPlayer
): Promise<void> {
  try {
    const rows = sqlite.prepare(`
      SELECT s.title, s.artist, h.played_at, h.requested_by
      FROM playback_history h
      JOIN songs s ON h.song_id = s.id
      ORDER BY h.played_at DESC
      LIMIT 10
    `).all() as Array<{ title: string; artist: string; played_at: number; requested_by: string }>;

    if (rows.length === 0) {
      await interaction.reply({ content: '📭 No playback history recorded yet.', ephemeral: true });
      return;
    }

    const lines = rows.map((r, i) => {
      const date = new Date(r.played_at * 1000);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `\`${i + 1}.\` **${r.title}** - *${r.artist}* (\`${timeStr}\`)`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📜 Recent Playback History')
      .setDescription(lines.join('\n'));

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: `⚠️ Failed to fetch history: ${(err as Error).message}`, ephemeral: true });
  }
}

/**
 * Handle /volume
 */
export async function handleVolume(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const vol = interaction.options.getInteger('percent', true);
  player.setVolume(vol);
  await interaction.reply({ content: `🔊 Volume set to **${vol}%**`, ephemeral: true });
}

/**
 * Handle /like
 */
export async function handleLike(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  if (!player.currentTrack) {
    await interaction.reply({ content: '❌ Nothing is currently playing!', ephemeral: true });
    return;
  }

  const track = player.currentTrack;
  const userId = interaction.user.id;
  const now = Math.floor(Date.now() / 1000);

  try {
    sqlite.prepare(`
      INSERT INTO user_preferences (user_id, target_type, target_key, display_name, likes, affinity_score, updated_at)
      VALUES (?, 'artist', ?, ?, 1, 3.0, ?)
      ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
        likes = likes + 1,
        affinity_score = ((likes + 1) * 3.0) + (full_plays * 1.0) - (early_skips * 1.5) - (dislikes * 4.0),
        updated_at = ?
    `).run(userId, track.artist.toLowerCase(), track.artist, now, now);

    sqlite.prepare(`
      INSERT INTO user_preferences (user_id, target_type, target_key, display_name, likes, affinity_score, updated_at)
      VALUES (?, 'song', ?, ?, 1, 3.0, ?)
      ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
        likes = likes + 1,
        affinity_score = ((likes + 1) * 3.0) + (full_plays * 1.0) - (early_skips * 1.5) - (dislikes * 4.0),
        updated_at = ?
    `).run(userId, track.id, track.title, now, now);

    await interaction.reply({ content: `❤️ Saved **${track.title}** by **${track.artist}** to your favorites!`, ephemeral: true });
  } catch (err) {
    await interaction.reply({ content: `⚠️ Could not record like: ${(err as Error).message}`, ephemeral: true });
  }
}

/**
 * Handle /dislike (Downvotes affinity; 3 room dislikes triggers auto-veto)
 */
export async function handleDislike(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  if (!player.currentTrack) {
    await interaction.reply({ content: '❌ Nothing is currently playing!', ephemeral: true });
    return;
  }

  const track = player.currentTrack;
  const userId = interaction.user.id;
  const now = Math.floor(Date.now() / 1000);

  try {
    sqlite.prepare(`
      INSERT INTO user_preferences (user_id, target_type, target_key, display_name, dislikes, affinity_score, updated_at)
      VALUES (?, 'artist', ?, ?, 1, -4.0, ?)
      ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
        dislikes = dislikes + 1,
        affinity_score = (likes * 3.0) + (full_plays * 1.0) - (early_skips * 1.5) - ((dislikes + 1) * 4.0),
        updated_at = ?
    `).run(userId, track.artist.toLowerCase(), track.artist, now, now);

    // Register with vetoService for 3-dislike community threshold
    const vetoResult = vetoService.registerDislike(track.artist, track.title, userId);
    if (vetoResult.autoVetoed) {
      player.skip();
      await interaction.reply({
        content: vetoResult.message || `🚫 **${track.artist}** has received 3 community dislikes and was vetoed from the station!`,
        ephemeral: false,
      });
    } else {
      await interaction.reply({
        content: `💔 Recorded your dislike for **${track.title}** by **${track.artist}**. (Will not autoplay for you again)`,
        ephemeral: true,
      });
    }
  } catch (err) {
    await interaction.reply({ content: `⚠️ Could not record dislike: ${(err as Error).message}`, ephemeral: true });
  }
}

export default {
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
  joinCommand,
  leaveCommand,
  handleSkip,
  handlePause,
  handleResume,
  handleStop,
  handleClear,
  handleRemove,
  handleQueue,
  handleShuffle,
  handleReplay,
  handleStatus,
  handleHistory,
  handleVolume,
  handleLike,
  handleDislike,
  handleJoin,
  handleLeave,
};
