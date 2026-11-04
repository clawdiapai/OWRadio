import { Client, GatewayIntentBits } from 'discord.js';
import config from '../src/config.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('ready', async () => {
  try {
    console.log(`Logged in as ${client.user?.tag}`);
    const guild = await client.guilds.fetch('1058541244365668372');
    console.log(`Guild: ${guild.name}`);

    // Check bot member in guild
    const botMember = await guild.members.fetch(client.user!.id);
    const voiceState = botMember.voice;
    console.log(`Bot Voice State:`, {
      channelId: voiceState.channelId,
      channelName: voiceState.channel?.name,
      mute: voiceState.mute,
      deaf: voiceState.deaf,
      serverMute: voiceState.serverMute,
      serverDeaf: voiceState.serverDeaf,
      suppress: voiceState.suppress,
    });

    if (voiceState.channel) {
      console.log(`Users in ${voiceState.channel.name}:`);
      for (const [id, member] of voiceState.channel.members) {
        console.log(`  - ${member.user.tag} (${member.user.id}) | deaf: ${member.voice.deaf || member.voice.selfDeaf}, mute: ${member.voice.mute || member.voice.selfMute}`);
      }
    } else {
      console.log('Bot is NOT in any voice channel in this guild!');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(config.DISCORD_TOKEN);
