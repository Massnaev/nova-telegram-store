function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
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
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          ...(inlineKeyboard.length > 0 ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {})
        })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        console.error(`Failed to send message to admin ${chatId}:`, data);
      } else {
        console.log(`Successfully sent order #${order.id} notification to admin ${chatId}`);
      }
    } catch (error) {
      console.error(`Network error sending message to admin ${chatId}:`, error);
    }
  }
}


