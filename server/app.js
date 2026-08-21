import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { createAdminCatalogService } from './admin.js';
import { createCatalogRepository } from './catalog.js';
import { ApiError } from './errors.js';
import { createOrderService } from './orders.js';
import { sendOrderToAdmins } from './telegram.js';
import { createImageUploadService, defaultUploadDirectory } from './uploads.js';

const idSchema = z.string().trim().min(1).max(64);
const imageUrlSchema = z.string().trim().max(500);
const variantCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).optional(),
  stock: z.number().int().min(0).max(1000000).optional().default(0),
  active: z.boolean().optional().default(true),
});
const variantUpdateSchema = variantCreateSchema.partial().omit({ id: true, slug: true });
const categoryCreateSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(160).optional().default(''),
  tone: z.string().trim().min(1).max(30).optional().default('orange'),
  sortOrder: z.number().int().min(0).max(100000).optional().default(0),
  active: z.boolean().optional().default(true),
});
const categoryUpdateSchema = categoryCreateSchema.partial().omit({ id: true });
const orderSchema = z.object({
  items: z.array(z.object({
    productId: idSchema,
    variantId: idSchema,
    quantity: z.number().int().min(1).max(999),
  })).min(1).max(100),
  comment: z.string().trim().max(1000).optional().default(''),
  customer: z.object({
    telegramUserId: z.string().trim().max(64).optional(),
    username: z.string().trim().max(64).optional(),
  }).optional(),
});
const settingsUpdateSchema = z.object({
  store_name: z.string().trim().min(1).max(120).optional(),
  store_tagline: z.string().trim().max(255).optional(),
  store_description: z.string().trim().max(1000).optional(),
  admin_username: z.string().trim().max(120).optional(),
});
const productCreateSchema = z.object({
  id: idSchema.optional(),
  categoryId: idSchema,
  name: z.string().trim().min(1).max(160),
  caption: z.string().trim().max(240).optional().default(''),
  description: z.string().trim().max(5000).optional().default(''),
  imageUrl: imageUrlSchema.optional().default(''),
  price: z.number().int().min(0).max(100000000),
  tone: z.string().trim().min(1).max(30).optional().default('blue'),
  sortOrder: z.number().int().min(0).max(100000).optional().default(0),
  active: z.boolean().optional().default(true),
  variants: z.array(variantCreateSchema).min(1).max(100),
});
const productUpdateSchema = productCreateSchema.partial().omit({ id: true, variants: true });
const orderStatusSchema = z.object({ status: z.enum(['confirmed', 'cancelled', 'completed']) });
const imageDeleteSchema = z.object({ imageUrl: z.string().trim().min(1).max(500) });

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError('Некорректные данные', 422, 'VALIDATION_ERROR', result.error.flatten());
  }
  return result.data;
}

function isValidToken(received, expected) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function requireAdmin(adminToken) {
  return (request, _response, next) => {
    if (!adminToken) return next(new ApiError('ADMIN_TOKEN не настроен', 503, 'ADMIN_NOT_CONFIGURED'));
    const authorization = request.get('authorization') ?? '';
    const received = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!isValidToken(received, adminToken)) {
      return next(new ApiError('Требуется авторизация администратора', 401, 'ADMIN_UNAUTHORIZED'));
    }
    return next();
  };
}

function corsOptions() {
  const configured = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (!configured?.length) return { origin: true };
  return {
    origin(origin, callback) {
      if (!origin || configured.includes(origin)) callback(null, true);
      else callback(new ApiError('Origin не разрешён', 403, 'CORS_FORBIDDEN'));
    },
  };
}

export function createApp({
  db,
  adminToken = process.env.ADMIN_TOKEN,
  adminIds = (process.env.ADMIN_TELEGRAM_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean),
  telegramBotToken = process.env.TELEGRAM_BOT_TOKEN,
  uploadDirectory = defaultUploadDirectory,
}) {
  const app = express();
  const catalog = createCatalogRepository(db);
  const orders = createOrderService(db);
  const admin = createAdminCatalogService(db);
  const images = createImageUploadService(uploadDirectory);

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '100kb' }));
  app.use('/uploads/products', express.static(images.uploadDirectory, { maxAge: '7d', immutable: false }));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, service: 'nova-api', timestamp: new Date().toISOString() });
  });

  app.post('/api/auth/telegram-admin', (request, response) => {
    const { initData, telegramUserId } = request.body || {};
    let userId = '';

    if (initData && telegramBotToken) {
      const tgUser = verifyTelegramWebAppData(initData, telegramBotToken);
      if (tgUser) userId = String(tgUser.id);
    }
    if (!userId && telegramUserId) {
      userId = String(telegramUserId);
    }

    const isAdmin = userId && adminIds.map(String).includes(userId);
    if (isAdmin) {
      return response.json({ ok: true, isAdmin: true, adminToken });
    }
    return response.status(403).json({ ok: false, isAdmin: false, error: 'Доступ запрещён' });
  });

  app.get('/api/categories', (_request, response) => {
    response.json({ data: catalog.listCategories() });
  });

  app.get('/api/products', (request, response) => {
    const category = typeof request.query.category === 'string' ? request.query.category.trim() : '';
    const search = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 100) : '';
    response.json({ data: catalog.listProducts({ category, search }) });
  });

  app.get('/api/products/:id', (request, response) => {
    const product = catalog.getProduct(request.params.id);
    if (!product) throw new ApiError('Товар не найден', 404, 'PRODUCT_NOT_FOUND');
    response.json({ data: product });
  });

  app.post('/api/orders', async (request, response) => {
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError('Некорректные данные заказа', 422, 'VALIDATION_ERROR', parsed.error.flatten());
    }
    const order = orders.createOrder(parsed.data);

    const adminIds = process.env.ADMIN_TELEGRAM_IDS?.split(',').map(id => id.trim()).filter(Boolean) || [];
    sendOrderToAdmins(order, process.env.TELEGRAM_BOT_TOKEN, adminIds)
      .then(() => console.log(`[API] Order #${order.id} notification sent to admins`))
      .catch(err => console.error(`[API] Failed to notify admins for order #${order.id}:`, err));

    response.status(201).json({ data: order });
  });

  app.post('/api/orders/:id/notify', async (request, response) => {
    console.log(`[API] Notification requested for order ${request.params.id}`);
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id) || id < 1) throw new ApiError('Некорректный номер заказа', 400, 'INVALID_ORDER_ID');
    
    const order = orders.getOrder(id);
    if (!order) {
      console.error(`[API] Order ${id} not found`);
      throw new ApiError('Заказ не найден', 404, 'ORDER_NOT_FOUND');
    }

    const adminIds = process.env.ADMIN_TELEGRAM_IDS?.split(',').map(id => id.trim()).filter(Boolean) || [];
    console.log(`[API] Sending to admins:`, adminIds);
    sendOrderToAdmins(order, process.env.TELEGRAM_BOT_TOKEN, adminIds).then(() => console.log('[API] Telegram message sent successfully')).catch(err => console.error('[API] Telegram message failed', err));

    response.status(200).json({ success: true });
  });

  app.get('/api/settings', (_request, response) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    response.json({
      data: {
        store_name: settings.store_name ?? 'NOVA Market',
        store_tagline: settings.store_tagline ?? 'Большой выбор. Легко заказать.',
        store_description: settings.store_description ?? 'Выберите товар и отправьте заказ администратору прямо в Telegram.',
        admin_username: settings.admin_username ?? '',
      },
    });
  });

  app.use('/api/admin', requireAdmin(adminToken));

  app.get('/api/admin/settings', (_request, response) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    response.json({
      data: {
        store_name: settings.store_name ?? 'NOVA Market',
        store_tagline: settings.store_tagline ?? 'Большой выбор. Легко заказать.',
        store_description: settings.store_description ?? 'Выберите товар и отправьте заказ администратору прямо в Telegram.',
        admin_username: settings.admin_username ?? '',
      },
    });
  });

  const settingsUpdateSchema = z.object({
    store_name: z.string().trim().min(1).max(100).optional(),
    store_tagline: z.string().trim().max(200).optional(),
    store_description: z.string().trim().max(1000).optional(),
    admin_username: z.string().trim().max(64).optional(),
  });

  app.patch('/api/admin/settings', (request, response) => {
    const data = parse(settingsUpdateSchema, request.body);
    const updateSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    db.exec('BEGIN');
    try {
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) updateSetting.run(key, value);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    response.json({ data: settings });
  });

  app.post('/api/admin/uploads/product-image', (request, response, next) => {
    images.middleware(request, response, (error) => {
      if (error) {
        if (error.code === 'LIMIT_FILE_SIZE') return next(new ApiError('Фотография должна быть не больше 5 МБ', 413, 'IMAGE_TOO_LARGE'));
        if (error instanceof ApiError) return next(error);
        return next(new ApiError('Не удалось загрузить фотографию', 422, 'IMAGE_UPLOAD_ERROR'));
      }
      try {
        return response.status(201).json({ data: images.save(request.file) });
      } catch (saveError) {
        return next(saveError);
      }
    });
  });
  app.delete('/api/admin/uploads/product-image', (request, response) => {
    const { imageUrl } = parse(imageDeleteSchema, request.body);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM products WHERE image_url = ?').get(imageUrl);
    if (count > 0) throw new ApiError('Сначала замените или удалите фотографию из товара', 409, 'IMAGE_IN_USE');
    images.remove(imageUrl);
    response.status(204).end();
  });

  app.get('/api/admin/orders', (request, response) => {
    const status = typeof request.query.status === 'string' ? request.query.status : '';
    if (status && !['new', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      throw new ApiError('Некорректный статус заказа', 422, 'INVALID_ORDER_STATUS');
    }
    response.json({ data: orders.listOrders(status) });
  });
  app.get('/api/admin/orders/:id', (request, response) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id) || id < 1) throw new ApiError('Некорректный номер заказа', 400, 'INVALID_ORDER_ID');
    const order = orders.getOrder(id);
    if (!order) throw new ApiError('Заказ не найден', 404, 'ORDER_NOT_FOUND');
    response.json({ data: order });
  });
  app.patch('/api/admin/orders/:id/status', (request, response) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id) || id < 1) throw new ApiError('Некорректный номер заказа', 400, 'INVALID_ORDER_ID');
    const { status } = parse(orderStatusSchema, request.body);
    response.json({ data: orders.updateStatus(id, status) });
  });

  app.get('/api/admin/categories', (_request, response) => {
    response.json({ data: admin.listCategories() });
  });
  app.post('/api/admin/categories', (request, response) => {
    response.status(201).json({ data: admin.createCategory(parse(categoryCreateSchema, request.body)) });
  });
  app.patch('/api/admin/categories/:id', (request, response) => {
    response.json({ data: admin.updateCategory(request.params.id, parse(categoryUpdateSchema, request.body)) });
  });
  app.delete('/api/admin/categories/:id', (request, response) => {
    admin.deleteCategory(request.params.id);
    response.status(204).end();
  });

  app.get('/api/admin/products', (_request, response) => {
    response.json({ data: admin.listProducts() });
  });
  app.post('/api/admin/products', (request, response) => {
    response.status(201).json({ data: admin.createProduct(parse(productCreateSchema, request.body)) });
  });
  app.patch('/api/admin/products/:id', (request, response) => {
    response.json({ data: admin.updateProduct(request.params.id, parse(productUpdateSchema, request.body)) });
  });
  app.delete('/api/admin/products/:id', (request, response) => {
    admin.deleteProduct(request.params.id);
    response.status(204).end();
  });

  app.post('/api/admin/products/:id/variants', (request, response) => {
    response.status(201).json({ data: admin.createVariant(request.params.id, parse(variantCreateSchema, request.body)) });
  });
  app.patch('/api/admin/variants/:id', (request, response) => {
    response.json({ data: admin.updateVariant(request.params.id, parse(variantUpdateSchema, request.body)) });
  });
  app.delete('/api/admin/variants/:id', (request, response) => {
    admin.deleteVariant(request.params.id);
    response.status(204).end();
  });

  // Client static files in production
  const serverDir = dirname(fileURLToPath(import.meta.url));
  const clientDist = resolve(serverDir, '..', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
        return res.sendFile(resolve(clientDist, 'index.html'));
      }
      return next();
    });
  }

  app.use((_request, _response, next) => next(new ApiError('Маршрут не найден', 404, 'NOT_FOUND')));
  app.use((error, _request, response, _next) => {
    const status = error instanceof ApiError ? error.status : 500;
    if (status >= 500) console.error(error);
    response.status(status).json({
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: status >= 500 ? 'Внутренняя ошибка сервера' : error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  });

  return app;
}
