import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { catalogSeed } from './catalog-seed.js';

const serverDir = dirname(fileURLToPath(import.meta.url));
export const defaultDatabasePath = resolve(serverDir, '..', 'data', 'nova.sqlite');

const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    tone TEXT NOT NULL DEFAULT 'blue',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL CHECK (price >= 0),
    tone TEXT NOT NULL DEFAULT 'blue',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, slug)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id TEXT,
    telegram_username TEXT,
    comment TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL CHECK (total >= 0),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'cancelled', 'completed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total INTEGER NOT NULL CHECK (line_total >= 0)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, active, sort_order);
  CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id, active);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
`;

function runMigrations(db) {
  const productColumns = db.prepare('PRAGMA table_info(products)').all();
  if (!productColumns.some((column) => column.name === 'image_url')) {
    db.exec("ALTER TABLE products ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  }

  // Ensure default settings exist
  const defaultSettings = {
    store_name: 'NOVA Market',
    store_tagline: 'Большой выбор. Легко заказать.',
    store_description: 'Выберите товар и отправьте заказ администратору прямо в Telegram.',
    admin_username: '',
  };

  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }
}

function seedDatabase(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM categories').get();
  if (count > 0) return;

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

  db.exec('BEGIN');
  try {
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
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createDatabase(databasePath = defaultDatabasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (databasePath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(schema);
  runMigrations(db);
  seedDatabase(db);
  return db;
}

