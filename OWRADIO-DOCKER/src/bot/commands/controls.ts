/**
 * @file controls.ts
 * @description Discord slash commands for player controls: /skip, /pause, /resume, /stop, /volume, /like, /dislike, /queue, /nowplaying.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildMember,
} from 'discord.js';
import type { GuildPlayer } from '../../player/GuildPlayer.js';
import { sqlite } from '../../db/index.js';
import featureFlags from '../../services/featureFlags.js';
import playerUi from '../playerUi.js';

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
  .setDescription('Stop playback and clear the queue');

export const volumeCommand = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Set playback volume (1-100)')
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
  .setDescription('Vote /like for the currently playing track and artist to boost future room recommendations');

export const dislikeCommand = new SlashCommandBuilder()
  .setName('dislike')
  .setDescription('Vote /dislike for the currently playing track and artist');

export const queueCommand = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('View the current queue and upcoming curated tracks');

export const nowplayingCommand = new SlashCommandBuilder()
  .setName('nowplaying')
  .setDescription('View detailed metadata, artwork, and room listeners for the active song');

export const joinCommand = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Summon the bot to your current voice channel');

export const leaveCommand = new SlashCommandBuilder()
  .setName('leave')
  .setDescription('Disconnect the bot from the voice channel');

/**
 * Handle /join
 */
export async function handleJoin(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const member = interaction.member as GuildMember;
  const channel = member?.voice?.channel;
  if (!channel) {
    await interaction.reply({ content: '❌ You must be inside a voice channel to use /join!', ephemeral: true });
    return;
  }
  await interaction.deferReply();
  await player.connectToVoice(channel);
  await interaction.editReply(`🔊 Joined voice channel **${channel.name}**!`);
}

/**
 * Handle /leave
 */
export async function handleLeave(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  player.disconnectVoice();
  await interaction.reply('👋 Disconnected from voice channel.');
}

/**
 * Handle /skip
 */
export async function handleSkip(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  if (!player.currentTrack) {
    await interaction.reply({ content: '❌ Nothing is currently playing!', ephemeral: true });
    return;
  }

  const skipped = player.currentTrack;
  player.skip(interaction.user.id);
  await interaction.reply(`⏭️ Skipped **${skipped.title}** by **${skipped.artist}**`);
}

/**
 * Handle /pause
 */
export async function handlePause(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const success = player.pause();
  if (success) {
    await interaction.reply('⏸️ Playback paused.');
  } else {
    await interaction.reply({ content: '❌ Playback is already paused or idle.', ephemeral: true });
  }
}

/**
 * Handle /resume
 */
export async function handleResume(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const success = player.resume();
  if (success) {
    await interaction.reply('▶️ Playback resumed.');
  } else {
    await interaction.reply({ content: '❌ Playback is already playing or idle.', ephemeral: true });
  }
}

/**
 * Handle /stop
 */
export async function handleStop(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  player.stop();
  await interaction.reply('⏹️ Playback stopped and queue cleared.');
}

/**
 * Handle /volume <percent>
 */
export async function handleVolume(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const vol = interaction.options.getInteger('percent', true);
  player.setVolume(vol);
  await interaction.reply(`🔊 Volume set to **${vol}%**`);
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
    // Record explicit like in user_preferences for artist
    sqlite.prepare(`
      INSERT INTO user_preferences (user_id, target_type, target_key, display_name, likes, affinity_score, updated_at)
      VALUES (?, 'artist', ?, ?, 1, 3.0, ?)
      ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
        likes = likes + 1,
        affinity_score = ((likes + 1) * 3.0) + (full_plays * 1.0) - (early_skips * 1.5) - (dislikes * 4.0),
        updated_at = ?
    `).run(userId, track.artist.toLowerCase(), track.artist, now, now);

    // Record for song
    sqlite.prepare(`
      INSERT INTO user_preferences (user_id, target_type, target_key, display_name, likes, affinity_score, updated_at)
      VALUES (?, 'song', ?, ?, 1, 3.0, ?)
      ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET
        likes = likes + 1,
        affinity_score = ((likes + 1) * 3.0) + (full_plays * 1.0) - (early_skips * 1.5) - (dislikes * 4.0),
        updated_at = ?
    `).run(userId, track.id, track.title, now, now);

    await interaction.reply(`❤️ You liked **${track.title}** by **${track.artist}**! VEXO will favor this style for you.`);
  } catch (err) {
    await interaction.reply({ content: `⚠️ Could not record like: ${(err as Error).message}`, ephemeral: true });
  }
}

/**
 * Handle /dislike
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

    const listeners = player.getActiveListenerUserIds();
    // If listener is alone in channel, dislike immediately skips
    if (listeners.length <= 1) {
      player.skip(userId);
      await interaction.reply(`💔 Disliked **${track.title}** by **${track.artist}**. Skipped track.`);
    } else {
      await interaction.reply(`💔 Disliked **${track.title}** by **${track.artist}**. Recorded in your taste profile.`);
    }
  } catch (err) {
    await interaction.reply({ content: `⚠️ Could not record dislike: ${(err as Error).message}`, ephemeral: true });
  }
}

/**
 * Handle /queue
 */
export async function handleQueue(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const current = player.currentTrack;
  const queue = player.getQueueList();

  if (!current && queue.length === 0) {
    await interaction.reply('📭 The queue is currently empty.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎶 VEXO Playback Queue');

  if (current) {
    const elapsedSec = current.startedAtUnix ? Math.floor((Date.now() / 1000) - current.startedAtUnix) : 0;
    const progressMin = Math.floor(elapsedSec / 60);
    const progressSec = String(elapsedSec % 60).padStart(2, '0');
    const totalMin = Math.floor(current.durationSec / 60);
    const totalSec = String(current.durationSec % 60).padStart(2, '0');

    embed.setDescription(
      `**Now Playing:**\n**[${current.title}](${current.artworkUrl})** by **${current.artist}**\n` +
      `⏱️ \`${progressMin}:${progressSec} / ${totalMin}:${totalSec}\` | Badge: \`${current.curatedBy}\``
    );
    embed.setThumbnail(current.artworkThumbUrl);
  }

  if (queue.length > 0) {
    const lines = queue.slice(0, 10).map((t, idx) => {
      const min = Math.floor(t.durationSec / 60);
      const sec = String(t.durationSec % 60).padStart(2, '0');
      return `\`${idx + 1}.\` **${t.title}** - ${t.artist} (\`${min}:${sec}\`) [${t.curatedBy}]`;
    });

    if (queue.length > 10) {
      lines.push(`*...and ${queue.length - 10} more tracks*`);
    }

    embed.addFields({ name: 'Up Next', value: lines.join('\n') });
  }

  await interaction.reply({ embeds: [embed] });
}

/**
 * Handle /nowplaying
 */
export async function handleNowPlaying(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const state = player.getStatePayload();
  const track = state.track;

  if (!track) {
    await interaction.reply({ content: '🔇 Nothing is currently playing.', ephemeral: true });
    return;
  }

  // Bind channel to this command's channel and render the sleek UI
  playerUi.setBoundChannelId(interaction.channelId);
  await interaction.reply({ content: '📻 Summoned Now Playing UI to this channel.', ephemeral: true });
  await playerUi.repositionToBottom();
}
