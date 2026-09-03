import { sendTelegramMessage } from '../services/telegram';
import { Bindings } from '../types';

// Add this new function for /start and /help
export const handleHelp = async (env: Bindings, chatId: number) => {
  const threshold = env.WARNING_THRESHOLD_PERCENT || 30;

  const text = `🤖 <b>Welcome to Mafund!</b>
Your lightning-fast financial tracker.

<b>📝 Log Transactions:</b>
<code>/in [method] [amount] [reason]</code> - Log income
<code>/out [method] [amount] [reason]</code> - Log outcome
<i>Example: /out cash 50000 lunch with friends</i>

<b>📊 Reports:</b>
<code>/daily</code> - Today's summary
<code>/weekly</code> - Last 7 days summary
<code>/monthly</code> - Last 30 days summary

<b>🕰 History:</b>
<code>/history</code> - Browse your transaction history

<b>💡 Features:</b>
• Smart warnings if an outcome exceeds ${threshold}% of your balance.
• Automated midnight summaries.`;

  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, text);
};

export const handleTransaction = async (env: Bindings, chatId: number, userId: number, text: string) => {
  const parts = text.split(' ');
  if (parts.length < 4) {
    return sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Format: `/[in/out] [method] [amount] [reason]`");
  }

  const type = text.startsWith('/in') ? 'income' : 'outcome';
  const method = parts[1];
  const amount = parseFloat(parts[2]);
  const reason = parts.slice(3).join(' ');

  // Get user DO Stub via RPC
  const trackerId = env.TRACKER_DO.idFromName(userId.toString());
  const tracker = env.TRACKER_DO.get(trackerId);

  // Register user globally
  const registryId = env.REGISTRY_DO.idFromName('global_registry');
  await env.REGISTRY_DO.get(registryId).registerUser(userId);

  if (type === 'outcome') {
    const balance = await tracker.getBalance();
    const threshold = env.WARNING_THRESHOLD_PERCENT / 100;
    if (balance > 0 && amount >= balance * threshold) {
      const percentage = ((amount / balance) * 100).toFixed(1);
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ <b>WARNING:</b> This outcome (${amount}) is ${percentage}% of your balance (${balance})!`);
    }
  }

  await tracker.addTransaction({ type, method, amount, reason });
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ <b>${type.toUpperCase()}</b> recorded.\n💰 Amount: ${amount}\n💳 Method: ${method}\n📝 Reason: ${reason}`);
};

export const handleReport = async (env: Bindings, chatId: number, userId: number, command: string) => {
  const mods: Record<string, { mod: string; title: string }> = {
    '/daily': { mod: '-1 day', title: 'Daily' },
    '/weekly': { mod: '-7 days', title: 'Weekly' },
    '/monthly': { mod: '-1 month', title: 'Monthly' }
  };
  const config = mods[command];
  if (!config) return;

  const tracker = env.TRACKER_DO.get(env.TRACKER_DO.idFromName(userId.toString()));
  const summary = await tracker.getSummaryByPeriod(config.mod);

  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `📊 <b>${config.title} Summary</b>\n\n🟢 Income: ${summary.income}\n🔴 Outcome: ${summary.outcome}\n💸 Net: ${summary.net}`);
};

export const handleHistory = async (env: Bindings, chatId: number, userId: number, text: string, offset = 0) => {
  const tracker = env.TRACKER_DO.get(env.TRACKER_DO.idFromName(userId.toString()));

  const parts = text.split(' ');
  let targetDate: string | null = null;
  let isSpecificDate = false;

  // Check if user provided a specific date (e.g., /history 2026-09-03)
  if (parts.length > 1) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(parts[1])) {
      targetDate = parts[1];
      isSpecificDate = true;
    } else {
      return sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, "❌ Invalid date format. Use `/history` or `/history YYYY-MM-DD`");
    }
  }

  // If no specific date was given, use the offset-based pagination
  if (!isSpecificDate) {
    targetDate = await tracker.getHistoryDateByOffset(offset);
  }

  if (!targetDate) {
    return sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, offset === 0 ? "No transactions found." : "No more transactions.");
  }

  const txs = await tracker.getTransactionsByDate(targetDate);

  if (isSpecificDate && txs.length === 0) {
    return sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, `📅 <b>History for ${targetDate}</b>\n\nNo transactions found.`);
  }

  let msgText = `📅 <b>History for ${targetDate}</b>\n\n`;
  txs.forEach((r) => msgText += `[${r.t_time}] ${r.type === 'income' ? '🟢' : '🔴'} <b>${r.amount}</b> - ${r.reason} (<i>${r.method}</i>)\n`);

  const buttons = [];

  // Only show Older/Newer pagination buttons if they are browsing normally
  if (!isSpecificDate) {
    if (offset > 0) buttons.push({ text: "⬅️ Newer", callback_data: `history_${offset - 1}` });
    buttons.push({ text: "Older ➡️", callback_data: `history_${offset + 1}` });
  }

  const replyMarkup = buttons.length > 0 ? { inline_keyboard: [buttons] } : null;

  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, msgText, replyMarkup);
};
