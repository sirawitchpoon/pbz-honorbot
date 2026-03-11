import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';

dotenv.config();

const commands: any[] = [];

// Determine commands directory path
// In dev: src/commands (when running ts-node)
// In prod: dist/commands (when running from dist)
const isDevelopment = __dirname.includes('src') || !__dirname.includes('dist');
const commandsPath = isDevelopment
  ? join(__dirname, 'commands')
  : join(__dirname, 'commands');

console.log(`[Deploy] Looking for commands in: ${commandsPath}`);
console.log(`[Deploy] Is development mode: ${isDevelopment}`);

// Check if directory exists
if (!existsSync(commandsPath)) {
  console.error(`[Deploy] ERROR: Commands directory does not exist: ${commandsPath}`);
  process.exit(1);
}

// Read all files from the commands directory
const allFiles = readdirSync(commandsPath);
console.log(`[Deploy] Found ${allFiles.length} files in commands directory:`, allFiles);

// Filter for .ts files (in dev) OR .js files (in prod/built), but exclude .d.ts files
const commandFiles = allFiles.filter(file => {
  const ext = extname(file);
  const isValidExt = isDevelopment ? ext === '.ts' : ext === '.js';
  const isNotDeclaration = !file.endsWith('.d.ts');
  return isValidExt && isNotDeclaration;
});

console.log(`[Deploy] Filtered to ${commandFiles.length} command files:`, commandFiles);

if (commandFiles.length === 0) {
  console.error(`[Deploy] ERROR: No command files found! Expected .ts files in dev or .js files in prod.`);
  console.error(`[Deploy] All files found:`, allFiles);
  process.exit(1);
}

// Load all commands
for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  console.log(`[Deploy] Attempting to load command from: ${filePath}`);
  
  try {
    const command = require(filePath);
    
    if (!command) {
      console.warn(`[Deploy] WARNING: Command at ${filePath} returned undefined/null`);
      continue;
    }
    
    if ('data' in command && 'execute' in command) {
      const commandData = command.data;
      if (commandData && typeof commandData.toJSON === 'function') {
        commands.push(commandData.toJSON());
        console.log(`[Deploy] ✓ Loaded command: ${commandData.name} from ${file}`);
      } else {
        console.warn(`[Deploy] WARNING: Command at ${filePath} has 'data' property but data.toJSON() is not a function`);
        console.warn(`[Deploy] Command structure:`, Object.keys(command));
      }
    } else {
      console.warn(`[Deploy] WARNING: Command at ${filePath} is missing required properties.`);
      console.warn(`[Deploy] Has 'data': ${'data' in command}, Has 'execute': ${'execute' in command}`);
      console.warn(`[Deploy] Available properties:`, Object.keys(command));
    }
  } catch (error) {
    console.error(`[Deploy] ERROR: Failed to load command from ${filePath}:`, error);
    if (error instanceof Error) {
      console.error(`[Deploy] Error message: ${error.message}`);
      console.error(`[Deploy] Error stack: ${error.stack}`);
    }
  }
}

console.log(`[Deploy] Total commands loaded: ${commands.length}`);
if (commands.length === 0) {
  console.error(`[Deploy] ERROR: No commands were successfully loaded!`);
  process.exit(1);
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

// Deploy commands
(async () => {
  try {
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!clientId) {
      throw new Error('CLIENT_ID is not defined in environment variables');
    }

    if (!guildId) {
      throw new Error('GUILD_ID is not defined in environment variables');
    }

    // Validate GUILD_ID is a valid snowflake
    if (!/^\d{17,19}$/.test(guildId) || guildId === 'your_guild_id_here') {
      throw new Error('GUILD_ID must be a valid Discord snowflake (17-19 digit number)');
    }

    console.log(`[Deploy] Starting to refresh ${commands.length} application (/) commands...`);
    console.log(`[Deploy] Client ID: ${clientId}`);
    console.log(`[Deploy] Guild ID: ${guildId}`);

    // CRITICAL: Clear global commands first to prevent duplicates
    // This ensures commands only exist in the guild, not both places
    console.log(`[Deploy] Clearing global commands to prevent duplicates...`);
    try {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: [] }
      );
      console.log(`[Deploy] ✓ Global commands cleared successfully`);
    } catch (error) {
      console.warn(`[Deploy] Warning: Could not clear global commands (may not exist):`, error);
      // Continue anyway - this is not critical
    }

    // Register commands to the guild for instant updates
    console.log(`[Deploy] Registering commands to guild...`);
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    ) as any[];

    console.log(`[Deploy] ✓ Successfully reloaded ${data.length} application (/) commands.`);
    console.log(`[Deploy] Registered commands:`, data.map((cmd: any) => cmd.name).join(', '));
    
    // Verify no duplicates
    const commandNames = data.map((cmd: any) => cmd.name);
    const duplicates = commandNames.filter((name: string, index: number) => commandNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      console.warn(`[Deploy] ⚠️ WARNING: Found duplicate commands: ${duplicates.join(', ')}`);
    } else {
      console.log(`[Deploy] ✓ No duplicate commands found - all commands are unique`);
    }
  } catch (error) {
    console.error('[Deploy] ERROR: Error deploying commands:', error);
    if (error instanceof Error) {
      console.error('[Deploy] Error message:', error.message);
      console.error('[Deploy] Error stack:', error.stack);
    }
    process.exit(1);
  }
})();
