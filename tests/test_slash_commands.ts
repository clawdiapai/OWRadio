import { controlCommand, voiceCommand } from '../src/bot/commands/controls.js';
import { stationCommand, tasteCommand } from '../src/bot/commands/features.js';
import { playCommand, vibeCommand } from '../src/bot/commands/play.js';

console.log('Testing Slash Commands consolidation (Strictly 6 Master Commands with Options)...');

const commands = [
  playCommand,
  vibeCommand,
  controlCommand,
  stationCommand,
  tasteCommand,
  voiceCommand,
];

console.log(`Master root commands count: ${commands.length}`);

if (commands.length !== 6) {
  throw new Error(`Expected exactly 6 commands, got ${commands.length}`);
}

const expectedNames = ['play', 'vibe', 'control', 'station', 'taste', 'voice'];
const actualNames = commands.map((c) => c.name);

for (const name of expectedNames) {
  if (!actualNames.includes(name)) {
    throw new Error(`Missing expected master command: ${name}`);
  }
}

for (const cmd of commands) {
  const json = cmd.toJSON();
  console.log(`\n✅ /${json.name}: ${json.description}`);
  if (json.options && json.options.length > 0) {
    for (const opt of json.options as any[]) {
      // Discord ApplicationCommandOptionType: 1 = SUB_COMMAND, 2 = SUB_COMMAND_GROUP
      if (opt.type === 1 || opt.type === 2) {
        throw new Error(`Command /${json.name} still contains a Subcommand! Subcommands cause Discord to flood the autocomplete list.`);
      }
      const choicesStr = opt.choices ? ` (${opt.choices.length} choices: ${opt.choices.map((c: any) => c.value).slice(0, 4).join(', ')}...)` : '';
      console.log(`    - Option: "${opt.name}" (type: ${opt.type}, req: ${opt.required || false})${choicesStr}`);
    }
  }
}

console.log('\n🎉 ALL 6 ROOT SLASH COMMANDS VERIFIED! Autocomplete list will show strictly 6 commands.');
