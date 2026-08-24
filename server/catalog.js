function mapVariant(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    stock: row.stock,
    active: Boolean(row.active),
  };
}

export function createCatalogRepository(db) {
  const variantsByProduct = db.prepare(`
    SELECT id, slug, name, stock, active
    FROM variants
    WHERE product_id = ? AND active = 1
    ORDER BY rowid
  `);

  const mapProduct = (row) => {
    const variants = variantsByProduct.all(row.id).map(mapVariant);
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
      stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
      active: Boolean(row.active),
      variants,
    };
  };

  return {
    listCategories() {
      return db.prepare(`
        SELECT c.id, c.name, c.subtitle, c.tone,
          COUNT(CASE WHEN p.active = 1 THEN 1 END) AS product_count
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        WHERE c.active = 1
        GROUP BY c.id
        ORDER BY c.sort_order, c.name
      `).all().map((row) => ({
        id: row.id,
        name: row.name,
        subtitle: row.subtitle,
        tone: row.tone,
        productCount: row.product_count,
      }));
    },

    listProducts({ category, search }) {
      const conditions = [
        'p.active = 1',
        'c.active = 1',
        'EXISTS (SELECT 1 FROM variants available_variant WHERE available_variant.product_id = p.id AND available_variant.active = 1)',
      ];
      const values = [];
      if (category) {
        conditions.push('p.category_id = ?');
        values.push(category);
      }
      if (search) {
        conditions.push(`(
          LOWER(p.name) LIKE LOWER(?) OR LOWER(p.caption) LIKE LOWER(?) OR
          EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND LOWER(v.name) LIKE LOWER(?))
        )`);
        const term = `%${search}%`;
        values.push(term, term, term);
      }

      return db.prepare(`
        SELECT p.*, c.name AS category_name
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.sort_order, p.name
      `).all(...values).map(mapProduct);
    },

    getProduct(id) {
      const row = db.prepare(`
        SELECT p.*, c.name AS category_name
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.id = ? AND p.active = 1 AND c.active = 1
          AND EXISTS (SELECT 1 FROM variants available_variant WHERE available_variant.product_id = p.id AND available_variant.active = 1)
      `).get(id);
      return row ? mapProduct(row) : null;
    },
  };
}
