/**
 * @file filter.ts
 * @description Interactive Granular Filter Controller (Lives, Covers, Instrumentals, Re-recorded).
 * Allows users and admins to toggle playback purity rules directly in Discord.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ButtonInteraction,
  SlashCommandBuilder,
} from 'discord.js';
import type { GuildPlayer } from '../../player/GuildPlayer.js';
import { dynamicSettings } from '../../services/dynamicSettings.js';
import { playerUi } from '../playerUi.js';

export const filterCommand = new SlashCommandBuilder()
  .setName('filter')
  .setDescription('View and toggle granular curation filters (Lives, Covers, Instrumentals, Re-recordings)')
  .addStringOption((opt) =>
    opt
      .setName('category')
      .setDescription('Filter category to adjust directly')
      .setRequired(false)
      .addChoices(
        { name: '🎤 Live Recordings', value: 'live' },
        { name: '🎸 Cover Tracks', value: 'covers' },
        { name: '🎹 Instrumentals', value: 'instrumentals' },
        { name: '💿 Re-Recorded Remakes', value: 'rerecorded' }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName('mode')
      .setDescription('Filter strictness mode')
      .setRequired(false)
      .addChoices(
        { name: '🚫 None (Strict studio only)', value: 'none' },
        { name: '⭐ High Quality (Official releases)', value: 'high_quality' },
        { name: '📻 Any (Permit all)', value: 'any' }
      )
  );

export function buildFilterDashboard(): {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const currentLive = dynamicSettings.getString('curation_filter_live', 'none');
  const currentCovers = dynamicSettings.getString('curation_filter_covers', 'none');
  const currentInst = dynamicSettings.getString('curation_filter_instrumentals', 'none');
  const currentRerecord = dynamicSettings.getString('curation_filter_rerecorded', 'none');

  const liveLabel =
    currentLive === 'none'
      ? '🎤 Live: 🚫 No Lives'
      : currentLive === 'high_quality'
      ? '🎤 Live: ⭐ High Quality'
      : '🎤 Live: 📻 Any Live';

  const coverLabel =
    currentCovers === 'none'
      ? '🎸 Covers: 🚫 No Covers'
      : currentCovers === 'high_quality'
      ? '🎸 Covers: ⭐ Big Artists'
      : '🎸 Covers: 📻 Any Cover';

  const instLabel =
    currentInst === 'none'
      ? '🎹 Inst: 🚫 No Inst'
      : currentInst === 'high_quality'
      ? '🎹 Inst: ⭐ High Quality'
      : '🎹 Inst: 📻 Any Inst';

  const rerecordLabel =
    currentRerecord === 'none'
      ? '💿 Remakes: 🚫 Original Masters'
      : '💿 Remakes: 📻 Any Version';

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_toggle_filter_live')
      .setLabel(liveLabel)
      .setStyle(currentLive === 'none' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_toggle_filter_covers')
      .setLabel(coverLabel)
      .setStyle(currentCovers === 'none' ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_toggle_filter_inst')
      .setLabel(instLabel)
      .setStyle(currentInst === 'none' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_toggle_filter_rerecord')
      .setLabel(rerecordLabel)
      .setStyle(currentRerecord === 'none' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_filter_recurate_now')
      .setLabel('⚡ Apply & Clean')
      .setStyle(ButtonStyle.Primary)
  );

  const content =
    '🎛️ **OWRadio Studio Guard & Granular Curation Filters**\n' +
    'Click any button below to toggle strictness rules for the live broadcast:\n' +
    `• **Live Concerts:** \`${currentLive.toUpperCase()}\`\n` +
    `• **Covers & Tributes:** \`${currentCovers.toUpperCase()}\`\n` +
    `• **Instrumentals & Karaoke:** \`${currentInst.toUpperCase()}\`\n` +
    `• **Re-Recorded Remakes:** \`${currentRerecord.toUpperCase()}\``;

  return { content, components: [row1, row2] };
}

export async function handleFilterCommand(
  interaction: ChatInputCommandInteraction,
  player: GuildPlayer
): Promise<void> {
  const category = interaction.options.getString('category');
  const mode = interaction.options.getString('mode');

  if (category && mode) {
    const key = `curation_filter_${category}`;
    dynamicSettings.set(key, mode);
    player.recurateAutoplayBuffer().catch(() => {});
    playerUi.scheduleUpdate(false);

    await interaction.reply({
      content: `✅ Updated **${category}** filter to: \`${mode}\`. Autoplay buffer cleaned!`,
      ephemeral: true,
    });
    return;
  }

  const dashboard = buildFilterDashboard();
  await interaction.reply({
    content: dashboard.content,
    components: dashboard.components,
    ephemeral: true,
  });
}

export async function handleFilterButtonInteraction(
  interaction: ButtonInteraction,
  player: GuildPlayer
): Promise<void> {
  const customId = interaction.customId;

  if (customId === 'btn_ui_filter') {
    const dashboard = buildFilterDashboard();
    await interaction.reply({
      content: dashboard.content,
      components: dashboard.components,
      ephemeral: true,
    });
    return;
  }

  if (customId === 'btn_toggle_filter_live') {
    const cur = dynamicSettings.getString('curation_filter_live', 'none');
    const next = cur === 'none' ? 'high_quality' : cur === 'high_quality' ? 'any' : 'none';
    dynamicSettings.set('curation_filter_live', next);
  } else if (customId === 'btn_toggle_filter_covers') {
    const cur = dynamicSettings.getString('curation_filter_covers', 'none');
    const next = cur === 'none' ? 'high_quality' : cur === 'high_quality' ? 'any' : 'none';
    dynamicSettings.set('curation_filter_covers', next);
  } else if (customId === 'btn_toggle_filter_inst') {
    const cur = dynamicSettings.getString('curation_filter_instrumentals', 'none');
    const next = cur === 'none' ? 'high_quality' : cur === 'high_quality' ? 'any' : 'none';
    dynamicSettings.set('curation_filter_instrumentals', next);
  } else if (customId === 'btn_toggle_filter_rerecord') {
    const cur = dynamicSettings.getString('curation_filter_rerecorded', 'none');
    const next = cur === 'none' ? 'any' : 'none';
    dynamicSettings.set('curation_filter_rerecorded', next);
  } else if (customId === 'btn_filter_recurate_now') {
    await player.recurateAutoplayBuffer();
  }

  player.recurateAutoplayBuffer().catch(() => {});
  playerUi.scheduleUpdate(false);

  const dashboard = buildFilterDashboard();
  await interaction.update({
    content: dashboard.content,
    components: dashboard.components,
  });
}
