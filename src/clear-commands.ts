import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!clientId) {
      throw new Error('CLIENT_ID is not defined in environment variables');
    }

    console.log('Started clearing application (/) commands.');

    // Clear guild commands
    if (guildId && /^\d{17,19}$/.test(guildId) && guildId !== 'your_guild_id_here') {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [] }
      );
      console.log('Successfully cleared all guild commands.');
    }

    // Clear global commands
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }
    );
    console.log('Successfully cleared all global commands.');

    console.log('All commands have been cleared. You can now deploy fresh commands with "npm run deploy".');
  } catch (error) {
    console.error('Error clearing commands:', error);
    process.exit(1);
  }
})();
