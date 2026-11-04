/**
 * @file play.ts
 * @description Slash command handlers for /play (song/playlist) and /vibe (AI natural language playlist).
 * Prioritizes YouTube for 99% of requests, supporting direct video links, playlist URLs, and fast search.
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
import { AudioTrack } from '../../player/AudioTrack.js';
import youtube from '../../services/youtube.js';
import deezer from '../../services/deezer.js';
import linkParser from '../../services/linkParser.js';
import ollama from '../../services/ollama.js';
import curator from '../../services/curator.js';
import vectorCurator from '../../services/vectorCurator.js';
import featureFlags from '../../services/featureFlags.js';
import { normalizeArtist, normalizeTrackTitle, getTrackDedupeKey } from '../../utils/trackDedupe.js';

export const playCommand = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play a song or playlist in your voice channel')
  .addSubcommand((sub) =>
    sub
      .setName('song')
      .setDescription('Play a song by YouTube link, title, artist, or streaming link')
      .addStringOption((opt) =>
        opt
          .setName('query')
          .setDescription('YouTube URL, song title, artist, or streaming link')
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('playlist')
      .setDescription('Play a full playlist URL (YouTube, Deezer, Spotify)')
      .addStringOption((opt) =>
        opt
          .setName('url')
          .setDescription('YouTube or Deezer playlist / album URL')
          .setRequired(true)
      )
  );

export const vibeCommand = new SlashCommandBuilder()
  .setName('vibe')
  .setDescription('AI DJ: Generate an instant playlist curated by local Ollama gemma4:e2b')
  .addStringOption((opt) =>
    opt
      .setName('prompt')
      .setDescription('Describe the vibe (e.g. "rainy night cyber drive", "90s funk barbecue")')
      .setRequired(true)
  );

/**
 * Ensures the bot is connected to the user's voice channel.
 */
async function ensureVoiceConnection(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<boolean> {
  const member = interaction.member as GuildMember;
  const channel = member?.voice?.channel;

  if (!channel) {
    await interaction.editReply('❌ You must be inside a voice channel to use this command!');
    return false;
  }

  await player.connectToVoice(channel);
  return true;
}

/**
 * Handle /play song <query> and /play playlist <url>
 */
export async function handlePlay(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  await interaction.deferReply();

  if (!(await ensureVoiceConnection(interaction, player))) {
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (subcommand === 'song') {
    const query = interaction.options.getString('query', true);
    const parsedLink = linkParser.parseMusicLink(query);

    let audioTrack: AudioTrack | null = null;

    // --- Case 1: Direct YouTube Link ---
    if (parsedLink?.provider === 'youtube') {
      // If a playlist URL was pasted into /play song, enqueue full playlist
      if (parsedLink.type === 'playlist' || (!parsedLink.id && parsedLink.playlistId)) {
        const playlistId = parsedLink.playlistId || parsedLink.id;
        const ytTracks = await youtube.getPlaylistTracks(playlistId, 50);
        if (ytTracks.length === 0) {
          await interaction.editReply(`❌ Could not resolve YouTube playlist from: ${query}`);
          return;
        }

        const tracks = ytTracks.map((meta) =>
          AudioTrack.fromYouTube(
            meta,
            userId,
            true,
            'User Request',
            `YouTube Playlist by ${interaction.user.username}`,
            'playlist',
            `yt_pl_${playlistId}`,
            `YouTube Playlist (${interaction.user.username})`
          )
        );
        const enqueuedCount = await player.enqueueBatch(tracks);

        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('▶️ Enqueued YouTube Playlist')
          .setDescription(`Successfully blended **${enqueuedCount} tracks** from YouTube into the queue.`)
          .setThumbnail(ytTracks[0].artworkThumbUrl);

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Single YouTube video
      const ytMeta = await youtube.getTrack(parsedLink.id);
      if (ytMeta) {
        audioTrack = AudioTrack.fromYouTube(
          ytMeta,
          userId,
          true,
          'User Request',
          `Requested by ${interaction.user.username}`,
          'single'
        );
      }
    }

    // --- Case 2: Deezer Link ---
    if (!audioTrack && parsedLink?.provider === 'deezer' && parsedLink.type === 'track') {
      const dzMeta = await deezer.getTrack(parsedLink.id);
      if (dzMeta) {
        audioTrack = AudioTrack.fromDeezer(
          dzMeta,
          userId,
          true,
          'User Request',
          `Requested by ${interaction.user.username}`,
          'single'
        );
      }
    }

    // --- Case 3: Freeform Query -> YouTube First (99% YouTube) ---
    if (!audioTrack && !parsedLink) {
      const ytResults = await youtube.searchTracks(query, 1);
      if (ytResults.length > 0) {
        audioTrack = AudioTrack.fromYouTube(
          ytResults[0],
          userId,
          true,
          'YouTube Search',
          `Requested by ${interaction.user.username}`,
          'single'
        );
      } else {
        // Fallback to Deezer search if YouTube search yields zero
        const dzResults = await deezer.searchTracks(query, 1);
        if (dzResults.length > 0) {
          audioTrack = AudioTrack.fromDeezer(
            dzResults[0],
            userId,
            true,
            'User Request',
            `Requested by ${interaction.user.username}`,
            'single'
          );
        }
      }
    }

    if (!audioTrack) {
      await interaction.editReply(`❌ Could not find track matching: **${query}**`);
      return;
    }

    await player.enqueue(audioTrack);

    const isYt = audioTrack.id.startsWith('yt_');
    const embed = new EmbedBuilder()
      .setColor(isYt ? 0xff0000 : 0x5865f2)
      .setTitle(isYt ? '▶️ Enqueued from YouTube' : '🎵 Enqueued Track')
      .setDescription(`**${audioTrack.title}**\nby **${audioTrack.artist}**`)
      .setThumbnail(audioTrack.artworkThumbUrl)
      .addFields(
        {
          name: 'Duration',
          value: `${Math.floor(audioTrack.durationSec / 60)}:${String(audioTrack.durationSec % 60).padStart(2, '0')}`,
          inline: true,
        },
        { name: 'Requested By', value: `<@${userId}>`, inline: true }
      );

    await interaction.editReply({ embeds: [embed] });
  } else if (subcommand === 'playlist') {
    const url = interaction.options.getString('url', true);
    const parsedLink = linkParser.parseMusicLink(url);

    // --- YouTube Playlist ---
    if (parsedLink?.provider === 'youtube') {
      const playlistId = parsedLink.playlistId || parsedLink.id;
      const ytTracks = await youtube.getPlaylistTracks(playlistId, 50);

      if (ytTracks.length === 0) {
        await interaction.editReply(`❌ Could not resolve YouTube playlist from: ${url}`);
        return;
      }

      const tracks = ytTracks.map((meta) =>
        AudioTrack.fromYouTube(
          meta,
          userId,
          true,
          'User Request',
          `YouTube Playlist by ${interaction.user.username}`,
          'playlist',
          `yt_pl_${playlistId}`,
          `YouTube Playlist (${interaction.user.username})`
        )
      );
      const enqueuedCount = await player.enqueueBatch(tracks);

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('▶️ Enqueued YouTube Playlist')
        .setDescription(`Successfully blended **${enqueuedCount} tracks** from YouTube into the multi-user queue.`)
        .setThumbnail(ytTracks[0].artworkThumbUrl);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // --- Deezer Album or Playlist ---
    let tracksMeta: any[] = [];
    let playlistTitle = 'Playlist';
    if (parsedLink?.provider === 'deezer') {
      if (parsedLink.type === 'album') {
        tracksMeta = await deezer.getAlbumTracks(parsedLink.id);
        playlistTitle = 'Deezer Album';
      } else if (parsedLink.type === 'playlist') {
        tracksMeta = await deezer.getPlaylistTracks(parsedLink.id);
        playlistTitle = 'Deezer Playlist';
      }
    }

    if (tracksMeta.length === 0) {
      // Fallback search YouTube for playlist/album name
      const ytSearchTracks = await youtube.searchTracks(url, 15);
      if (ytSearchTracks.length > 0) {
        const tracks = ytSearchTracks.map((meta) =>
          AudioTrack.fromYouTube(
            meta,
            userId,
            true,
            'User Request',
            `YouTube Search by ${interaction.user.username}`,
            'playlist',
            `yt_search_${Date.now()}`,
            `YouTube Search by ${interaction.user.username}`
          )
        );
        const enqueuedCount = await player.enqueueBatch(tracks);

        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('▶️ Enqueued Tracks')
          .setDescription(`Successfully blended **${enqueuedCount} tracks** from YouTube into the queue.`)
          .setThumbnail(ytSearchTracks[0].artworkThumbUrl);

        await interaction.editReply({ embeds: [embed] });
        return;
      }
    }

    if (tracksMeta.length === 0) {
      await interaction.editReply(`❌ Could not resolve playlist or album from: ${url}`);
      return;
    }

    const plTracks = tracksMeta.map((meta) =>
      AudioTrack.fromDeezer(
        meta,
        userId,
        true,
        'User Request',
        `Enqueued from playlist by ${interaction.user.username}`,
        'playlist',
        `dz_pl_${parsedLink?.id || Date.now()}`,
        `${playlistTitle} (${interaction.user.username})`
      )
    );
    const enqueuedCount = await player.enqueueBatch(plTracks);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📑 Enqueued Playlist')
      .setDescription(`Successfully blended **${enqueuedCount} tracks** into the multi-user queue.`)
      .setThumbnail(tracksMeta[0].artworkThumbUrl);

    await interaction.editReply({ embeds: [embed] });
  }
}

/**
 * Handle /vibe <prompt>
 */
export async function handleVibe(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  await interaction.deferReply();

  if (!(await ensureVoiceConnection(interaction, player))) {
    return;
  }

  const prompt = interaction.options.getString('prompt', true).trim();
  const userId = interaction.user.id;

  // 1. Check if user wants to turn off / disengage vibe steering
  const isOffCommand = ['off', 'clear', 'reset', 'none', 'stop', 'disable'].includes(prompt.toLowerCase());
  if (isOffCommand) {
    vectorCurator.setVibeSteering('', null);
    await player.recurateAutoplayBuffer();
    await interaction.editReply({
      content: '✨ **384-d Latent Vibe Steering Disengaged.** Autoplay buffer purged and restored to natural room listener consensus.',
      components: [],
    });
    return;
  }

  // 2. If 384-d Latent Steering is enabled, embed prompt and set real-time steering vector
  let isSteeringEngaged = false;
  if (featureFlags.isEnabled('feature_vibe_latent')) {
    const vector = await vectorCurator.embedText(prompt);
    if (vector) {
      vectorCurator.setVibeSteering(prompt, vector);
      isSteeringEngaged = true;
    }
  }

  // 3. Purge stale unplayed autoplay tracks so the new vibe takes effect IMMEDIATELY
  await player.recurateAutoplayBuffer();

  const vibeItems = await ollama.generateVibePlaylist(prompt, 6);

  if (vibeItems.length === 0) {
    if (isSteeringEngaged) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_vibe_steer_off')
          .setLabel('⏹️ Disengage Vibe Steering')
          .setStyle(ButtonStyle.Danger)
      );
      await interaction.editReply({
        content: `✨ Latent steering vector set for: **"${prompt}"**! Autoplay buffer recurated toward this aesthetic.`,
        components: [row],
      });
      return;
    }
    await interaction.editReply(`❌ Local AI curator could not generate a playlist for: "${prompt}"`);
    return;
  }

  // Track seen IDs, normalized artists, and canonical dedupe keys to eliminate duplicates
  const queuedSongIds = new Set<string>();
  const queuedArtists = new Set<string>();
  const queuedDedupeKeys = new Set<string>();

  // Seed with currently playing track
  if (player.currentTrack) {
    queuedSongIds.add(player.currentTrack.id);
    queuedArtists.add(player.currentTrack.artist.toLowerCase());
    const normCurArt = normalizeArtist(player.currentTrack.artist).replace(/\s+/g, '');
    if (normCurArt) queuedArtists.add(normCurArt);
    queuedDedupeKeys.add(getTrackDedupeKey(player.currentTrack.title, player.currentTrack.artist));
  }

  // Seed with all queued tracks
  for (const q of player.getQueueList()) {
    queuedSongIds.add(q.id);
    queuedArtists.add(q.artist.toLowerCase());
    const normQArt = normalizeArtist(q.artist).replace(/\s+/g, '');
    if (normQArt) queuedArtists.add(normQArt);
    queuedDedupeKeys.add(getTrackDedupeKey(q.title, q.artist));
  }

  let queuedCount = 0;
  for (const item of vibeItems) {
    const itemNormArtist = normalizeArtist(item.artist).replace(/\s+/g, '');
    // In a single vibe playlist, enforce strictly 1 song per artist
    if (itemNormArtist && queuedArtists.has(itemNormArtist)) {
      console.log(`[Vibe] Skipping duplicate artist "${item.artist}" for vibe diversity.`);
      continue;
    }

    // Search YouTube first for the vibe recommendation
    const ytResults = await youtube.searchTracks(`${item.artist} ${item.title}`, 1);
    const ytCandidate = ytResults[0];

    if (ytCandidate) {
      const candKey = getTrackDedupeKey(ytCandidate.title, ytCandidate.artist);
      const candNormArt = normalizeArtist(ytCandidate.artist).replace(/\s+/g, '');

      if (
        !queuedDedupeKeys.has(candKey) &&
        (!candNormArt || !queuedArtists.has(candNormArt)) &&
        curator.isTrackEligibleForAutoplay(
          ytCandidate.id,
          ytCandidate.artist,
          queuedSongIds,
          queuedArtists,
          ytCandidate.title,
          queuedDedupeKeys
        )
      ) {
        const track = AudioTrack.fromYouTube(
          ytCandidate,
          userId,
          true,
          'AI Vibe Mix',
          item.reason,
          'playlist',
          `vibe_${prompt.toLowerCase().replace(/\s+/g, '_')}`,
          `Vibe: "${prompt}"`
        );
        await player.enqueue(track);
        queuedSongIds.add(ytCandidate.id);
        queuedArtists.add(ytCandidate.artist.toLowerCase());
        if (candNormArt) queuedArtists.add(candNormArt);
        if (itemNormArtist) queuedArtists.add(itemNormArtist);
        queuedDedupeKeys.add(candKey);
        queuedCount++;
        continue;
      }
    }

    // Fallback search Deezer
    const searchRes = await deezer.searchTracks(`${item.artist} ${item.title}`, 1);
    const meta = searchRes[0];
    if (meta) {
      const metaKey = getTrackDedupeKey(meta.title, meta.artist);
      const metaNormArt = normalizeArtist(meta.artist).replace(/\s+/g, '');

      if (
        !queuedDedupeKeys.has(metaKey) &&
        (!metaNormArt || !queuedArtists.has(metaNormArt)) &&
        curator.isTrackEligibleForAutoplay(
          meta.id,
          meta.artist,
          queuedSongIds,
          queuedArtists,
          meta.title,
          queuedDedupeKeys
        )
      ) {
        const track = AudioTrack.fromDeezer(
          meta,
          userId,
          true,
          'AI Vibe Mix',
          item.reason,
          'playlist',
          `vibe_${prompt.toLowerCase().replace(/\s+/g, '_')}`,
          `Vibe: "${prompt}"`
        );
        await player.enqueue(track);
        queuedSongIds.add(meta.id);
        queuedArtists.add(meta.artist.toLowerCase());
        if (metaNormArt) queuedArtists.add(metaNormArt);
        if (itemNormArtist) queuedArtists.add(itemNormArtist);
        queuedDedupeKeys.add(metaKey);
        queuedCount++;
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('✨ AI Vibe Mix & Latent Steering')
    .setDescription(
      `Vibe prompt: **"${prompt}"**\n` +
      `Enqueued **${queuedCount} tracks** matching this aesthetic.\n\n` +
      (isSteeringEngaged
        ? '🛰️ **384-d Latent Steering:** `ACTIVE` (Autoplay queue recurated to this vector)'
        : '⚡ *Standard Playlist Mode (384-d steering toggle is OFF in settings)*')
    )
    .setFooter({ text: 'Ollama all-minilm + gemma4:e2b • Type /vibe off to disengage' });

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (isSteeringEngaged) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_vibe_steer_off')
          .setLabel('⏹️ Disengage Vibe Steering')
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  await interaction.editReply({ embeds: [embed], components });
}

export default {
  playCommand,
  vibeCommand,
  handlePlay,
  handleVibe,
};
