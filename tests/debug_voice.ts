import { Client, GatewayIntentBits, Events } from 'discord.js';
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import config from '../src/config.js';

async function main() {
  console.log('Logging in to Discord...');
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  await client.login(config.DISCORD_TOKEN);
  console.log('Logged in as:', client.user?.tag);

  const guild = config.DEFAULT_GUILD_ID
    ? client.guilds.cache.get(config.DEFAULT_GUILD_ID)
    : client.guilds.cache.first();

  if (!guild) {
    console.error('No guild found!');
    process.exit(1);
  }

  // Fetch full guild and channels
  await guild.fetch();
  const channels = await guild.channels.fetch();
  console.log(`Found guild: "${guild.name}" (${guild.id}) with ${channels.size} channels`);

  // Find voice channels
  const voiceChannels = channels.filter((c) => c && c.isVoiceBased());
  console.log(`Found ${voiceChannels.size} voice channels:`);
  for (const [id, ch] of voiceChannels) {
    console.log(` - "${ch?.name}" (${id}), type: ${ch?.type}`);
  }

  // Find channel with human members, or first voice channel
  const targetChannel = voiceChannels.find((ch: any) => ch.members?.some((m: any) => !m.user.bot)) || voiceChannels.first();

  if (!targetChannel) {
    console.error('No voice channel available to join!');
    process.exit(1);
  }

  console.log(`Targeting voice channel: "${targetChannel.name}" (${targetChannel.id})`);

  const connection = joinVoiceChannel({
    channelId: targetChannel.id,
    guildId: targetChannel.guild.id,
    adapterCreator: targetChannel.guild.voiceAdapterCreator as any,
    selfDeaf: true,
    selfMute: false,
    debug: true,
  });

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[VoiceConnection] Status: ${oldState.status} -> ${newState.status}`);
    if (newState.status === VoiceConnectionStatus.Disconnected) {
      console.log(`[VoiceConnection:Disconnected] Reason:`, (newState as any).reason);
      console.log(`[VoiceConnection:Disconnected] CloseCode:`, (newState as any).closeCode);
    }
  });

  connection.on('debug', (msg) => {
    console.log(`[VoiceConnection:debug] ${msg}`);
  });

  connection.on('error', (err) => {
    console.error(`[VoiceConnection:error]`, err);
  });

  // Track networking sub-state
  const checkNetworking = setInterval(() => {
    const net = (connection.state as any)?.networking;
    if (net) {
      clearInterval(checkNetworking);
      console.log('[Networking] Networking instance available!');
      net.on('debug', (msg: string) => {
        console.log(`[Networking:debug] ${msg}`);
      });
      net.on('error', (err: any) => {
        console.error(`[Networking:error]`, err);
      });
      net.on('stateChange', (oldN: any, newN: any) => {
        console.log(`[Networking:stateChange] ${oldN.code ?? oldN} -> ${newN.code ?? newN}`);
        if (newN.ws) {
          console.log('[Networking] WS instance exists on state');
          newN.ws.on('close', (code: any, reason: any) => {
            console.log(`[Networking:WS:close] Code: ${code}, Reason: ${reason ? reason.toString() : 'none'}`);
          });
          newN.ws.on('error', (err: any) => {
            console.log(`[Networking:WS:error]`, err);
          });
        }
      });
      if (net.state?.ws) {
        net.state.ws.on('close', (code: any, reason: any) => {
          console.log(`[Networking:WS:close] Code: ${code}, Reason: ${reason ? reason.toString() : 'none'}`);
        });
      }
    }
  }, 100);

  try {
    console.log('Waiting for connection to enter Ready state (30s timeout)...');
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log('🎉 SUCCESSFULLY ENTERED READY STATE!');
    await new Promise((r) => setTimeout(r, 5000));
  } catch (err) {
    console.error('Failed to enter Ready state:', (err as Error).message);
  } finally {
    connection.destroy();
    client.destroy();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
