import { createApp } from './app.js';
import { createDatabase } from './db.js';

const port = Number.parseInt(process.env.PORT ?? process.env.API_PORT ?? '3001', 10);
const db = createDatabase();
const app = createApp({ db });

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`NOVA Store & API running on port ${port}`);
});

function shutdown(signal) {
  console.log(`${signal}: завершаем NOVA API`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
