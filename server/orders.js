import { ApiError } from './errors.js';

export function createOrderService(db) {
  const statusTransitions = {
    new: new Set(['confirmed', 'cancelled']),
    confirmed: new Set(['completed', 'cancelled']),
    completed: new Set(),
    cancelled: new Set(),
  };
  const findVariant = db.prepare(`
    SELECT
      p.id AS product_id, p.name AS product_name, p.price, p.active AS product_active,
      v.id AS variant_id, v.name AS variant_name, v.stock, v.active AS variant_active
    FROM variants v
    JOIN products p ON p.id = v.product_id
    WHERE p.id = ? AND v.id = ?
  `);
  const insertOrder = db.prepare(`
    INSERT INTO orders (telegram_user_id, telegram_username, comment, total)
    VALUES (?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO order_items (
      order_id, product_id, variant_id, product_name, variant_name,
      unit_price, quantity, line_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const decreaseStock = db.prepare(`
    UPDATE variants
    SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND stock >= ?
  `);

  function getOrder(orderId) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return null;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId);
    return {
      id: order.id,
      status: order.status,
      total: order.total,
      comment: order.comment,
      customer: {
        telegramUserId: order.telegram_user_id,
        username: order.telegram_username,
      },
      createdAt: order.created_at,
      items: items.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        variantName: item.variant_name,
        unitPrice: item.unit_price,
        quantity: item.quantity,
        lineTotal: item.line_total,
      })),
    };
  }

  function listOrders(status = '') {
    const rows = status
      ? db.prepare('SELECT id FROM orders WHERE status = ? ORDER BY id DESC').all(status)
      : db.prepare('SELECT id FROM orders ORDER BY id DESC').all();
    return rows.map((row) => getOrder(row.id));
  }

  function updateStatus(orderId, nextStatus) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
      if (!order) throw new ApiError('Заказ не найден', 404, 'ORDER_NOT_FOUND');
      if (order.status === nextStatus) {
        db.exec('COMMIT');
        return getOrder(orderId);
      }
      if (!statusTransitions[order.status]?.has(nextStatus)) {
        throw new ApiError('Недопустимый переход статуса заказа', 409, 'INVALID_ORDER_TRANSITION', {
          current: order.status, requested: nextStatus,
        });
      }
      if (nextStatus === 'cancelled') {
        const items = db.prepare('SELECT variant_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
        const restoreStock = db.prepare('UPDATE variants SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        for (const item of items) restoreStock.run(item.quantity, item.variant_id);
      }
      db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nextStatus, orderId);
      db.exec('COMMIT');
      return getOrder(orderId);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    createOrder(payload) {
      const normalized = new Map();
      for (const item of payload.items) {
        const key = `${item.productId}:${item.variantId}`;
        normalized.set(key, { ...item, quantity: (normalized.get(key)?.quantity ?? 0) + item.quantity });
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        const resolvedItems = [];
        let total = 0;

        for (const item of normalized.values()) {
          const row = findVariant.get(item.productId, item.variantId);
          if (!row || !row.product_active || !row.variant_active) {
            throw new ApiError('Товар или вариант больше недоступен', 404, 'ITEM_NOT_FOUND', item);
          }
          if (row.stock < item.quantity) {
            throw new ApiError(
              `Недостаточно товара «${row.product_name} · ${row.variant_name}»`,
              409,
              'INSUFFICIENT_STOCK',
              { ...item, available: row.stock },
            );
          }
          const lineTotal = row.price * item.quantity;
          total += lineTotal;
          resolvedItems.push({ ...row, quantity: item.quantity, lineTotal });
        }

        const result = insertOrder.run(
          payload.customer?.telegramUserId ?? null,
          payload.customer?.username ?? null,
          payload.comment ?? '',
          total,
        );
        const orderId = Number(result.lastInsertRowid);

        for (const item of resolvedItems) {
          const stockResult = decreaseStock.run(item.quantity, item.variant_id, item.quantity);
          if (stockResult.changes !== 1) {
            throw new ApiError('Остаток изменился во время оформления', 409, 'STOCK_CHANGED');
          }
          insertItem.run(
            orderId, item.product_id, item.variant_id, item.product_name, item.variant_name,
            item.price, item.quantity, item.lineTotal,
          );
        }

        db.exec('COMMIT');
        return getOrder(orderId);
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    getOrder,
    listOrders,
    updateStatus,
  };
}
