import { randomUUID } from 'node:crypto';
import { ApiError } from './errors.js';

function slugify(value, fallback) {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return slug || fallback;
}

function booleanValue(value) {
  return value ? 1 : 0;
}

export function createAdminCatalogService(db) {
  const categoryExists = db.prepare('SELECT 1 FROM categories WHERE id = ?');
  const productExists = db.prepare('SELECT 1 FROM products WHERE id = ?');
  const variantExists = db.prepare('SELECT 1 FROM variants WHERE id = ?');
  const findProduct = db.prepare('SELECT id FROM products WHERE id = ?');

  function makeUniqueId(statement, preferred, prefix) {
    let id = preferred || `${prefix}-${randomUUID().slice(0, 8)}`;
    while (statement.get(id)) id = `${prefix}-${randomUUID().slice(0, 8)}`;
    return id;
  }

  function listCategories() {
    return db.prepare(`
      SELECT c.id, c.name, c.subtitle, c.tone, c.sort_order, c.active,
        COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order, c.name
    `).all().map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.subtitle,
      tone: row.tone,
      sortOrder: row.sort_order,
      active: Boolean(row.active),
      productCount: row.product_count,
    }));
  }

  function mapProduct(row) {
    const variants = db.prepare(`
      SELECT id, slug, name, stock, active
      FROM variants WHERE product_id = ? ORDER BY rowid
    `).all(row.id).map((variant) => ({
      id: variant.id,
      slug: variant.slug,
      name: variant.name,
      stock: variant.stock,
      active: Boolean(variant.active),
    }));

    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      name: row.name,
      caption: row.caption,
      description: row.description,
      imageUrl: row.image_url,
      price: row.price,
      tone: row.tone,
      sortOrder: row.sort_order,
      active: Boolean(row.active),
      variants,
    };
  }

  function getProduct(id) {
    const row = db.prepare(`
      SELECT p.*, c.name AS category_name
      FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.id = ?
    `).get(id);
    return row ? mapProduct(row) : null;
  }

  function listProducts() {
    return db.prepare(`
      SELECT p.*, c.name AS category_name
      FROM products p JOIN categories c ON c.id = p.category_id
      ORDER BY p.sort_order, p.name
    `).all().map(mapProduct);
  }

  function createCategory(input) {
    const preferred = input.id || slugify(input.name, 'category');
    if (input.id && categoryExists.get(input.id)) {
      throw new ApiError('Категория с таким ID уже существует', 409, 'CATEGORY_EXISTS');
    }
    const id = makeUniqueId(categoryExists, preferred, 'category');
    db.prepare(`
      INSERT INTO categories (id, name, subtitle, tone, sort_order, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.subtitle, input.tone, input.sortOrder, booleanValue(input.active));
    return listCategories().find((category) => category.id === id);
  }

  function updateCategory(id, input) {
    if (!categoryExists.get(id)) throw new ApiError('Категория не найдена', 404, 'CATEGORY_NOT_FOUND');
    const columns = {
      name: 'name', subtitle: 'subtitle', tone: 'tone', sortOrder: 'sort_order', active: 'active',
    };
    const entries = Object.entries(input).filter(([key]) => columns[key]);
    if (!entries.length) return listCategories().find((category) => category.id === id);
    const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(', ');
    const values = entries.map(([key, value]) => key === 'active' ? booleanValue(value) : value);
    db.prepare(`UPDATE categories SET ${assignments} WHERE id = ?`).run(...values, id);
    return listCategories().find((category) => category.id === id);
  }

  function deleteCategory(id) {
    if (!categoryExists.get(id)) throw new ApiError('Категория не найдена', 404, 'CATEGORY_NOT_FOUND');
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM products WHERE category_id = ?').get(id);
    if (count > 0) {
      throw new ApiError('Сначала удалите или перенесите товары категории', 409, 'CATEGORY_NOT_EMPTY');
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }

  function insertVariant(productId, input, position = 1) {
    const slug = input.slug || slugify(input.name, `variant-${position}`);
    const preferredId = input.id || `${productId}-${slug}`;
    if (input.id && variantExists.get(input.id)) {
      throw new ApiError('Вариант с таким ID уже существует', 409, 'VARIANT_EXISTS');
    }
    const duplicateSlug = db.prepare('SELECT 1 FROM variants WHERE product_id = ? AND slug = ?').get(productId, slug);
    if (duplicateSlug) throw new ApiError('Вариант с таким кодом уже существует', 409, 'VARIANT_SLUG_EXISTS');
    const id = makeUniqueId(variantExists, preferredId, 'variant');
    db.prepare(`
      INSERT INTO variants (id, product_id, slug, name, stock, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, productId, slug, input.name, input.stock, booleanValue(input.active));
    return id;
  }

  function createProduct(input) {
    if (!categoryExists.get(input.categoryId)) {
      throw new ApiError('Категория не найдена', 404, 'CATEGORY_NOT_FOUND');
    }
    const preferred = input.id || slugify(input.name, 'product');
    if (input.id && productExists.get(input.id)) {
      throw new ApiError('Товар с таким ID уже существует', 409, 'PRODUCT_EXISTS');
    }
    const id = makeUniqueId(productExists, preferred, 'product');

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO products (
          id, category_id, name, caption, description, image_url, price, tone, sort_order, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.categoryId, input.name, input.caption, input.description,
        input.imageUrl, input.price, input.tone, input.sortOrder, booleanValue(input.active),
      );
      input.variants.forEach((variant, index) => insertVariant(id, variant, index + 1));
      db.exec('COMMIT');
      return getProduct(id);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function updateProduct(id, input) {
    if (!productExists.get(id)) throw new ApiError('Товар не найден', 404, 'PRODUCT_NOT_FOUND');
    if (input.categoryId && !categoryExists.get(input.categoryId)) {
      throw new ApiError('Категория не найдена', 404, 'CATEGORY_NOT_FOUND');
    }
    const columns = {
      categoryId: 'category_id', name: 'name', caption: 'caption', description: 'description',
      imageUrl: 'image_url', price: 'price', tone: 'tone', sortOrder: 'sort_order', active: 'active',
    };
    const entries = Object.entries(input).filter(([key]) => columns[key]);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(', ');
      const values = entries.map(([key, value]) => key === 'active' ? booleanValue(value) : value);
      db.prepare(`
        UPDATE products SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(...values, id);
    }
    return getProduct(id);
  }

  function deleteProduct(id) {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?').get(id);
    const result = count > 0
      ? db.prepare('UPDATE products SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
      : db.prepare('DELETE FROM products WHERE id = ?').run(id);
    if (count > 0) db.prepare('UPDATE variants SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?').run(id);
    if (!result.changes) throw new ApiError('Товар не найден', 404, 'PRODUCT_NOT_FOUND');
  }

  function createVariant(productId, input) {
    if (!findProduct.get(productId)) throw new ApiError('Товар не найден', 404, 'PRODUCT_NOT_FOUND');
    const id = insertVariant(productId, input);
    return getProduct(productId).variants.find((variant) => variant.id === id);
  }

  function updateVariant(id, input) {
    const current = db.prepare('SELECT product_id FROM variants WHERE id = ?').get(id);
    if (!current) throw new ApiError('Вариант не найден', 404, 'VARIANT_NOT_FOUND');
    if (input.slug) {
      const duplicate = db.prepare(`
        SELECT 1 FROM variants WHERE product_id = ? AND slug = ? AND id <> ?
      `).get(current.product_id, input.slug, id);
      if (duplicate) throw new ApiError('Вариант с таким кодом уже существует', 409, 'VARIANT_SLUG_EXISTS');
    }
    const columns = { slug: 'slug', name: 'name', stock: 'stock', active: 'active' };
    const entries = Object.entries(input).filter(([key]) => columns[key]);
    if (entries.length) {
      const assignments = entries.map(([key]) => `${columns[key]} = ?`).join(', ');
      const values = entries.map(([key, value]) => key === 'active' ? booleanValue(value) : value);
      db.prepare(`
        UPDATE variants SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(...values, id);
    }
    return getProduct(current.product_id).variants.find((variant) => variant.id === id);
  }

  function deleteVariant(id) {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE variant_id = ?').get(id);
    const result = count > 0
      ? db.prepare('UPDATE variants SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
      : db.prepare('DELETE FROM variants WHERE id = ?').run(id);
    if (!result.changes) throw new ApiError('Вариант не найден', 404, 'VARIANT_NOT_FOUND');
  }

  return {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    createVariant,
    updateVariant,
    deleteVariant,
  };
}
