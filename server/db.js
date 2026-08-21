import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { catalogSeed } from './catalog-seed.js';

const SQL = await initSqlJs();

class SqlJsDatabaseAdapter {
  constructor(databasePath) {
    this.databasePath = databasePath;
    this.isMemory = !databasePath || databasePath === ':memory:';
    if (!this.isMemory && existsSync(databasePath)) {
      try {
        const fileBuffer = readFileSync(databasePath);
        this.db = new SQL.Database(fileBuffer);
      } catch {
        this.db = new SQL.Database();
      }
    } else {
      this.db = new SQL.Database();
    }
  }

  save() {
    if (!this.isMemory && this.databasePath) {
      try {
        mkdirSync(dirname(this.databasePath), { recursive: true });
        const binaryArray = this.db.export();
        writeFileSync(this.databasePath, Buffer.from(binaryArray));
      } catch (err) {
        console.error('Failed to save sqlite file:', err);
      }
    }
  }

  exec(sql) {
    this.db.exec(sql);
    this.save();
  }

  prepare(sql) {
    const self = this;
    return {
      all(...params) {
        const flatParams = params.flat();
        const stmt = self.db.prepare(sql);
        if (flatParams.length > 0) stmt.bind(flatParams);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
      get(...params) {
        const flatParams = params.flat();
        const stmt = self.db.prepare(sql);
        if (flatParams.length > 0) stmt.bind(flatParams);
        let result = undefined;
        if (stmt.step()) {
          result = stmt.getAsObject();
        }
        stmt.free();
        return result;
      },
      run(...params) {
        const flatParams = params.flat();
        const stmt = self.db.prepare(sql);
        if (flatParams.length > 0) stmt.bind(flatParams);
        stmt.step();
        stmt.free();
        self.save();
        const rowsModified = self.db.getRowsModified();
        let lastInsertRowid = 0;
        try {
          const lastIdRes = self.db.exec('SELECT last_insert_rowid() AS id');
          if (lastIdRes?.[0]?.values?.[0]?.[0] !== undefined) {
            lastInsertRowid = lastIdRes[0].values[0][0];
          }
        } catch {}
        return { changes: rowsModified, lastInsertRowid };
      },
    };
  }

  close() {
    this.save();
    this.db.close();
  }
}

const serverDir = dirname(fileURLToPath(import.meta.url));
export const defaultDatabasePath = resolve(serverDir, '..', 'data', 'nova.sqlite');

const schema = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT 'blue',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    tone TEXT NOT NULL DEFAULT 'blue',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id TEXT,
    telegram_username TEXT,
    comment TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    line_total INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

function runMigrations(db) {
  const productColumns = db.prepare('PRAGMA table_info(products)').all();
  if (!productColumns.some((column) => column.name === 'image_url')) {
    db.exec("ALTER TABLE products ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  }

  const defaultSettings = {
    store_name: 'NOVA Market',
    store_tagline: 'Большой выбор. Легко заказать.',
    store_description: 'Выберите товар и отправьте заказ администратору прямо в Telegram.',
    admin_username: '',
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }
}

function seedDatabase(db) {
  const countRow = db.prepare('SELECT COUNT(*) AS count FROM categories').get();
  if (countRow && countRow.count > 0) return;

  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, subtitle, tone, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertProduct = db.prepare(`
    INSERT INTO products (id, category_id, name, caption, description, price, tone, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO variants (id, product_id, slug, name, stock)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const category of catalogSeed.categories) {
    insertCategory.run(category.id, category.name, category.subtitle, category.tone, category.sortOrder);
  }
  for (const product of catalogSeed.products) {
    insertProduct.run(
      product.id, product.categoryId, product.name, product.caption,
      product.description, product.price, product.tone, product.sortOrder,
    );
    for (const variant of product.variants) {
      insertVariant.run(variant.id, product.id, variant.slug, variant.name, variant.stock);
    }
  }
}

export function createDatabase(databasePath = defaultDatabasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new SqlJsDatabaseAdapter(databasePath);
  db.exec(schema);
  runMigrations(db);
  seedDatabase(db);
  return db;
}

