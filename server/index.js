import { createApp } from './app.js';
import { createDatabase } from './db.js';
import { startBotPolling } from './telegram.js';

const port = Number.parseInt(process.env.PORT ?? process.env.API_PORT ?? '3000', 10);
const db = createDatabase();
const app = createApp({ db });

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const adminIds = (process.env.ADMIN_TELEGRAM_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
const appUrl = process.env.APP_URL ?? '';

const getStoreInfo = () => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } catch {
    return { store_name: 'NOVA Market' };
  }
};

const stopPolling = startBotPolling({ botToken, adminIds, getStoreInfo, appUrl });

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`NOVA Store & API running on port ${port}`);
});

function shutdown(signal) {
  console.log(`${signal}: завершаем NOVA API`);
  stopPolling();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

