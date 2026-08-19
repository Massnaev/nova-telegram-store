import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from './app.js';
import { createDatabase } from './db.js';

let db;
let server;
let baseUrl;
let uploadDirectory;
const adminHeaders = {
  authorization: 'Bearer test-admin-token',
  'content-type': 'application/json',
};

before(async () => {
  db = createDatabase(':memory:');
  uploadDirectory = mkdtempSync(join(tmpdir(), 'nova-uploads-'));
  server = createApp({ db, adminToken: 'test-admin-token', uploadDirectory }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  db.close();
  rmSync(uploadDirectory, { recursive: true, force: true });
});

test('health endpoint отвечает', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'nova-api');
});

test('каталог возвращает демонстрационный товар с вариантами', async () => {
  const response = await fetch(`${baseUrl}/api/products?category=demo`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, 'nova-mango');
  assert.equal(body.data[0].variants.length, 4);
});

test('административный каталог закрыт токеном', async () => {
  const response = await fetch(`${baseUrl}/api/admin/products`);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'ADMIN_UNAUTHORIZED');
});

test('администратор создаёт категорию, товар и меняет остаток', async () => {
  const categoryResponse = await fetch(`${baseUrl}/api/admin/categories`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ id: 'devices', name: 'Устройства' }),
  });
  assert.equal(categoryResponse.status, 201);

  const productResponse = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      id: 'starter-kit', categoryId: 'devices', name: 'Starter Kit', price: 2900,
      variants: [{ id: 'starter-kit-blue', slug: 'blue', name: 'Синий', stock: 4 }],
    }),
  });
  const productBody = await productResponse.json();
  assert.equal(productResponse.status, 201);
  assert.equal(productBody.data.variants[0].stock, 4);

  const variantResponse = await fetch(`${baseUrl}/api/admin/variants/starter-kit-blue`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ stock: 11 }),
  });
  const variantBody = await variantResponse.json();
  assert.equal(variantResponse.status, 200);
  assert.equal(variantBody.data.stock, 11);

  const publicResponse = await fetch(`${baseUrl}/api/products/starter-kit`);
  const publicBody = await publicResponse.json();
  assert.equal(publicBody.data.variants[0].stock, 11);
});

test('администратор загружает, получает и удаляет фотографию', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'product.png');
  const uploadResponse = await fetch(`${baseUrl}/api/admin/uploads/product-image`, {
    method: 'POST', headers: { authorization: adminHeaders.authorization }, body: form,
  });
  const uploadBody = await uploadResponse.json();
  assert.equal(uploadResponse.status, 201);
  assert.match(uploadBody.data.imageUrl, /^\/uploads\/products\/[a-f0-9-]+\.png$/);

  const imageResponse = await fetch(`${baseUrl}${uploadBody.data.imageUrl}`);
  assert.equal(imageResponse.status, 200);
  assert.equal((await imageResponse.arrayBuffer()).byteLength, png.byteLength);

  const deleteResponse = await fetch(`${baseUrl}/api/admin/uploads/product-image`, {
    method: 'DELETE', headers: adminHeaders, body: JSON.stringify({ imageUrl: uploadBody.data.imageUrl }),
  });
  assert.equal(deleteResponse.status, 204);
  assert.equal((await fetch(`${baseUrl}${uploadBody.data.imageUrl}`)).status, 404);
});

test('заказ создаётся и уменьшает остаток', async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      items: [{ productId: 'nova-mango', variantId: 'nova-mango-mango', quantity: 2 }],
      comment: 'Позвонить перед отправкой',
      customer: { telegramUserId: '123456', username: 'nikita' },
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.data.total, 1400);
  assert.equal(body.data.items[0].quantity, 2);

  const productResponse = await fetch(`${baseUrl}/api/products/nova-mango`);
  const productBody = await productResponse.json();
  const mango = productBody.data.variants.find((variant) => variant.id === 'nova-mango-mango');
  assert.equal(mango.stock, 3);

  const ordersResponse = await fetch(`${baseUrl}/api/admin/orders`, { headers: adminHeaders });
  const ordersBody = await ordersResponse.json();
  assert.equal(ordersResponse.status, 200);
  assert.equal(ordersBody.data[0].id, body.data.id);

  const cancelResponse = await fetch(`${baseUrl}/api/admin/orders/${body.data.id}/status`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'cancelled' }),
  });
  const cancelBody = await cancelResponse.json();
  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelBody.data.status, 'cancelled');

  const restoredProductResponse = await fetch(`${baseUrl}/api/products/nova-mango`);
  const restoredProductBody = await restoredProductResponse.json();
  const restoredMango = restoredProductBody.data.variants.find((variant) => variant.id === 'nova-mango-mango');
  assert.equal(restoredMango.stock, 5);
});

test('заказ с недостаточным остатком отклоняется', async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      items: [{ productId: 'nova-mango', variantId: 'nova-mango-mango', quantity: 10 }],
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error.code, 'INSUFFICIENT_STOCK');
  assert.equal(body.error.details.available, 5);
});
