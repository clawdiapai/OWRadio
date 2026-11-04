import { Client, GatewayIntentBits } from 'discord.js';
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
} from '@discordjs/voice';
import { spawn } from 'node:child_process';
import config from '../src/config.js';

async function main() {
  console.log('Testing voice connection and audio playback...');
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  await client.login(config.DISCORD_TOKEN);
  console.log('Logged in as:', client.user?.tag);

  const guild = config.DEFAULT_GUILD_ID
    ? client.guilds.cache.get(config.DEFAULT_GUILD_ID)
    : client.guilds.cache.first();

  if (!guild) {
    console.error('No guild found');
    process.exit(1);
  }

  await guild.fetch();
  const channels = await guild.channels.fetch();
  const voiceChannels = channels.filter((c) => c && c.isVoiceBased());
  
  // Find channel with members
  let targetChannel: any = null;
  for (const [id, ch] of voiceChannels) {
    if (ch && (ch as any).members && (ch as any).members.size > 0) {
      targetChannel = ch;
      break;
    }
  }

  if (!targetChannel) {
    targetChannel = voiceChannels.first();
  }

  console.log(`Connecting to voice channel: "${targetChannel.name}" (${targetChannel.id})`);

  const connection = joinVoiceChannel({
    channelId: targetChannel.id,
    guildId: targetChannel.guild.id,
    adapterCreator: targetChannel.guild.voiceAdapterCreator as any,
    selfDeaf: false,
    selfMute: false,
  });

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[VoiceConnection] ${oldState.status} -> ${newState.status}`);
  });

  const origClose = (connection as any).onNetworkingClose.bind(connection);
  (connection as any).onNetworkingClose = (code: any) => {
    console.log('🚨 ON NETWORKING CLOSE CALLED WITH CODE:', code);
    origClose(code);
  };

  connection.on('error', (err) => console.error('[VoiceConnection:error]', err));

  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  console.log('🎉 VoiceConnection is READY!');

  const player = createAudioPlayer();
  player.on('stateChange', (oldState, newState) => {
    console.log(`[AudioPlayer] ${oldState.status} -> ${newState.status}`);
  });
  player.on('error', (err) => console.error('[AudioPlayer:error]', err));

  connection.subscribe(player);

  // Generate a 440Hz sine wave tone for 5 seconds using ffmpeg to raw s16le PCM 48kHz stereo
  console.log('Generating test tone with ffmpeg...');
  const ffmpeg = spawn('ffmpeg', [
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=5',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ]);

  const resource = createAudioResource(ffmpeg.stdout, {
    inputType: StreamType.Raw,
  });

  player.play(resource);
  console.log('Playing test tone for 5 seconds...');

  await new Promise((resolve) => {
    player.on(AudioPlayerStatus.Idle, resolve);
    setTimeout(resolve, 6000);
  });

  console.log('Finished playing test tone!');
  connection.destroy();
  client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
