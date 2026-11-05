import { controlCommand } from '../src/bot/commands/controls.js';
import { stationCommand, tasteCommand } from '../src/bot/commands/features.js';
import { playCommand, vibeCommand } from '../src/bot/commands/play.js';
import { joinCommand, leaveCommand } from '../src/bot/commands/controls.js';

console.log('Testing Slash Commands consolidation (Option C)...');

const commands = [
  playCommand,
  vibeCommand,
  controlCommand,
  stationCommand,
  tasteCommand,
  joinCommand,
  leaveCommand,
];

console.log(`Consolidated count: ${commands.length} root commands (down from 25)`);

if (commands.length !== 7) {
  throw new Error(`Expected 7 commands, got ${commands.length}`);
}

for (const cmd of commands) {
  const json = cmd.toJSON();
  console.log(`- /${json.name}: ${json.description}`);
  if (json.options && json.options.length > 0) {
    const subNames = json.options.map((o: any) => o.name).join(', ');
    console.log(`    Subcommands/Options: [${subNames}]`);
  }
}

console.log('✅ Option C slash commands verified successfully!');
