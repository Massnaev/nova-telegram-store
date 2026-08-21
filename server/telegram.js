import crypto from 'node:crypto';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function verifyTelegramWebAppData(initData, botToken) {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) return null;

    const userStr = params.get('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (err) {
    return null;
  }
}

export async function sendTelegramMessage(botToken, chatId, text, keyboard = null) {
  if (!botToken || !chatId) return;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...(keyboard ? { reply_markup: keyboard } : {})
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (err) {
    console.error(`Failed to send Telegram message to ${chatId}:`, err);
  }
}

export async function sendOrderToAdmins(order, botToken, adminIds) {
  if (!botToken || !adminIds || adminIds.length === 0) {
    console.warn('Telegram API credentials or admin IDs not set. Order notification skipped.');
    return;
  }

  const itemsList = order.items.map(item => 
    `• ${item.quantity}× <b>${escapeHtml(item.productName)}</b> (${escapeHtml(item.variantName)}) — ${item.lineTotal} руб.`
  ).join('\n');

  const customerInfo = order.customer?.username 
    ? `@${escapeHtml(order.customer.username)}` 
    : (order.customer?.telegramUserId ? `ID: <code>${escapeHtml(order.customer.telegramUserId)}</code>` : 'Неизвестен');

  const message = `🛍 <b>Новый заказ #${order.id}</b>\n\n` +
    `<b>Покупатель:</b> ${customerInfo}\n` +
    (order.comment ? `<b>Комментарий:</b> ${escapeHtml(order.comment)}\n\n` : '\n') +
    `<b>Состав:</b>\n${itemsList}\n\n` +
    `<b>Итого:</b> ${order.total} руб.`;
  
  const inlineKeyboard = [];
  if (order.customer?.username) {
    const cleanUsername = order.customer.username.replace(/^@/, '');
    inlineKeyboard.push([
      { text: `💬 Написать клиенту (@${cleanUsername})`, url: `https://t.me/${cleanUsername}` }
    ]);
  } else if (order.customer?.telegramUserId) {
    inlineKeyboard.push([
      { text: '💬 Открыть профиль клиента', url: `tg://user?id=${order.customer.telegramUserId}` }
    ]);
  }

  for (const chatId of adminIds) {
    await sendTelegramMessage(botToken, chatId, message, inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : null);
  }
}

export function startBotPolling({ botToken, adminIds, getStoreInfo, appUrl = '' }) {
  if (!botToken) return () => {};
  let isRunning = true;
  let offset = 0;

  console.log('🤖 Telegram bot polling started.');

  async function poll() {
    while (isRunning) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=20&allowed_updates=["message","callback_query"]`,
          { signal: AbortSignal.timeout(30000) }
        );
        if (!response.ok) {
          await new Promise(r => setTimeout(r, 4000));
          continue;
        }
        const data = await response.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            if (update.message) {
              await handleMessage(update.message);
            }
          }
        }
      } catch (err) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async function handleMessage(msg) {
    const chatId = msg.chat?.id;
    const text = msg.text?.trim() || '';
    const userId = String(msg.from?.id || '');
    const isAdmin = adminIds.map(String).includes(userId);

    if (!chatId) return;

    const store = (typeof getStoreInfo === 'function' ? getStoreInfo() : null) || {
      store_name: 'NOVA Market',
      store_tagline: 'Качественные товары с удобным заказом.',
    };

    if (text.startsWith('/start') || text.startsWith('/admin') || text.startsWith('/help')) {
      if (isAdmin) {
        const adminButtons = [];
        if (appUrl) {
          adminButtons.push([{ text: '⚙️ Открыть Админ-панель', web_app: { url: `${appUrl}/#admin` } }]);
          adminButtons.push([{ text: '🛍 Открыть витрину магазина', web_app: { url: appUrl } }]);
        }

        const reply = `👑 <b>Панель администратора — ${escapeHtml(store.store_name)}</b>\n\n` +
          `Здравствуйте, <b>${escapeHtml(msg.from?.first_name || 'Администратор')}</b>!\n` +
          `Вы авторизованы по вашему Telegram ID (<code>${userId}</code>).\n\n` +
          `Вам доступно управление товарами, фотографиями, остатками и заказами.\n` +
          `Откройте меню или Mini App в боте для доступа к панели.`;

        await sendTelegramMessage(botToken, chatId, reply, adminButtons.length > 0 ? { inline_keyboard: adminButtons } : null);
      } else {
        const clientButtons = [];
        if (appUrl) {
          clientButtons.push([{ text: '🛍 Открыть магазин', web_app: { url: appUrl } }]);
        }

        const reply = `👋 <b>Добро пожаловать в ${escapeHtml(store.store_name)}!</b>\n\n` +
          `${escapeHtml(store.store_tagline || 'Качественные товары с быстрой доставкой.')}\n\n` +
          `Нажмите кнопку <b>«Открыть магазин»</b> ниже или в меню чата, чтобы посмотреть каталог и оформить заказ 👇`;

        await sendTelegramMessage(botToken, chatId, reply, clientButtons.length > 0 ? { inline_keyboard: clientButtons } : null);
      }
    } else if (text === '/id') {
      await sendTelegramMessage(botToken, chatId, `Ваш Telegram ID: <code>${userId}</code>\nСтатус: <b>${isAdmin ? 'Администратор 👑' : 'Покупатель 👤'}</b>`, null);
    }
  }

  poll();

  return () => { isRunning = false; };
}


