export const sendTelegramMessage = async (
  token: string,
  chatId: number,
  text: string,
  replyMarkup: any = null
): Promise<void> => {
  const payload: Record<string, any> = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

export const editTelegramMessage = async (
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup: any = null
): Promise<void> => {
  const payload: Record<string, any> = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};
