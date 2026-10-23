import { Client, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import { getConfig, loadConfig } from './config';
import { startDashboard } from './dashboard/server';
import { closeSalma, handleSalmaMessage, primeSalmaHistory } from './utils/salma';

dotenv.config();
loadConfig();

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.on('clientReady', () => {
  console.log(`Logged in as ${client.user?.tag} (${client.user?.id})`);

  const cfg = getConfig();
  if (!cfg.persona.enabled) {
    console.log('[Salma] Persona is disabled — enable it from the dashboard to start listening.');
    return;
  }
  if (cfg.persona.channelIds.length === 0) {
    console.log('[Salma] Persona is enabled but no channels are configured.');
    return;
  }

  // Give the persona conversation context immediately after a restart.
  void primeSalmaHistory(client).catch((err) => console.error('[Salma] History priming failed:', err));
});

client.on('messageCreate', (message) => {
  try {
    // Fire-and-forget: batching and the Live decision happen in the background,
    // so the gateway event is never blocked.
    handleSalmaMessage(message);
  } catch (err) {
    console.error('[Salma] Message handler error:', err);
  }
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  closeSalma();
  dashboardServer?.close();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  closeSalma();
  dashboardServer?.close();
  client.destroy();
  process.exit(0);
});

// Start the local configuration dashboard before Discord login, so settings
// can still be fixed when the token or intents are wrong.
const dashboardServer = startDashboard(client);

async function start(): Promise<void> {
  const cfg = getConfig();
  const token = process.env.BOT_TOKEN || cfg.token;

  if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
    console.error('\n❌ No bot token configured.');
    console.error('   Add BOT_TOKEN to .env, or set it from the dashboard (Advanced → Secrets).\n');
    process.exitCode = 1;
    return;
  }

  try {
    await client.login(token);
  } catch (err: any) {
    if (err?.status === 401 || err?.code === 'TokenInvalid') {
      console.error('\n❌ Discord rejected the bot token (401 Unauthorized).\n');
      console.error('   The token was reset/revoked, or it is the CLIENT SECRET');
      console.error('   instead of the BOT TOKEN (both look like "xxx.yyy.zzz").\n');
      console.error('   Fix:');
      console.error('     1. Developer Portal → your app → Bot → "Reset Token"');
      console.error('     2. Copy the BOT TOKEN (not the client secret)');
      console.error('     3. Put it in .env (BOT_TOKEN=...) or save it in the dashboard');
      console.error('     4. Restart the bot\n');
    } else if (err?.status === 403) {
      console.error('\n❌ Missing Access (403). The bot is not in that server.');
      console.error('   Invite it with the link from Developer Portal → Bot page.\n');
    } else {
      console.error('Failed to start bot:', err);
    }
    process.exitCode = 1;
  }
}

void start();
