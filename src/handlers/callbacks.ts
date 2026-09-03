import { editTelegramMessage } from '../services/telegram';
import { Bindings } from '../types';

export const handleCallback = async (env: Bindings, chatId: number, messageId: number, userId: number, data: string) => {
  const tracker = env.TRACKER_DO.get(env.TRACKER_DO.idFromName(userId.toString()));

  if (data.startsWith('history_')) {
    const offset = parseInt(data.split('_')[1], 10);
    const targetDate = await tracker.getHistoryDateByOffset(offset);
    if (!targetDate) return;

    const txs = await tracker.getTransactionsByDate(targetDate);
    let text = `📅 <b>History for ${targetDate}</b>\n\n`;
    txs.forEach((r) => text += `[${r.t_time}] ${r.type === 'income' ? '🟢' : '🔴'} <b>${r.amount}</b> - ${r.reason} (<i>${r.method}</i>)\n`);

    const buttons = [];
    if (offset > 0) buttons.push({ text: "⬅️ Newer", callback_data: `history_${offset - 1}` });
    buttons.push({ text: "Older ➡️", callback_data: `history_${offset + 1}` });

    await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, messageId, text, { inline_keyboard: [buttons] });
  }

  else if (data.startsWith('show_date_')) {
    const dateStr = data.replace('show_date_', '');
    const txs = await tracker.getTransactionsByDate(dateStr);

    let inc = 0, out = 0, txText = '';
    txs.forEach((r) => {
      if (r.type === 'income') inc += r.amount;
      if (r.type === 'outcome') out += r.amount;
      txText += `[${r.t_time}] ${r.type === 'income' ? '🟢' : '🔴'} <b>${r.amount}</b> - ${r.reason} (<i>${r.method}</i>)\n`;
    });

    const msg = `🌙 <b>Summary for ${dateStr}</b>\n\n🟢 Income: ${inc}\n🔴 Outcome: ${out}\n💸 Net: ${inc - out}\n\n<b>Transactions:</b>\n${txText || 'No transactions found.'}`;
    await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, messageId, msg);
  }
};
