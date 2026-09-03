import { sendTelegramMessage } from '../services/telegram';
import { Bindings } from '../types';

export const handleCron = async (env: Bindings) => {
  // Get yesterday's date in WIB
  const dateObj = new Date(Date.now() + (7 * 60 * 60 * 1000) - (24 * 60 * 60 * 1000));
  const targetDate = dateObj.toISOString().split('T')[0];

  const registry = env.REGISTRY_DO.get(env.REGISTRY_DO.idFromName('global_registry'));
  const users = await registry.getAllUsers();

  const promises = users.map(async (userId) => {
    const tracker = env.TRACKER_DO.get(env.TRACKER_DO.idFromName(userId.toString()));
    const txs = await tracker.getTransactionsByDate(targetDate);

    // Only send summary if they had transactions that day
    if (txs.length === 0) return;

    let inc = 0, out = 0;
    txs.forEach((r) => r.type === 'income' ? inc += r.amount : out += r.amount);

    const msg = `🌙 <b>Midnight Summary</b> (${targetDate})\n\n🟢 Income: ${inc}\n🔴 Outcome: ${out}\n💸 Net: ${inc - out}\n\n<i>Keep up the good tracking!</i>`;
    const keyboard = { inline_keyboard: [[{ text: "📝 Show Transactions", callback_data: `show_date_${targetDate}` }]] };

    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, userId, msg, keyboard);
  });

  await Promise.all(promises);
};
