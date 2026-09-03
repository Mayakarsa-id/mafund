import { Hono } from "hono";
import { Bindings } from "./types";
// Import handleHelp alongside your other command handlers
import {
  handleHelp,
  handleTransaction,
  handleReport,
  handleHistory,
} from "./handlers/commands";
import { handleCallback } from "./handlers/callbacks";
import { handleCron } from "./handlers/cron";

export { TrackerDO } from "./durable/TrackerDO";
export { RegistryDO } from "./durable/RegistryDO";

const app = new Hono<{ Bindings: Bindings }>();

app.post("/webhook", async (c) => {
  const update = await c.req.json();

  if (update.callback_query) {
    const { chat, message_id } = update.callback_query.message;
    const userId = update.callback_query.from.id;
    await handleCallback(
      c.env,
      chat.id,
      message_id,
      userId,
      update.callback_query.data,
    );
    return c.text("OK");
  }

  if (update.message && update.message.text) {
    const {
      text,
      chat: { id: chatId },
      from: { id: userId },
    } = update.message;

    // Route /start and /help to the new handler
    if (text.startsWith("/start") || text.startsWith("/help")) {
      await handleHelp(c.env, chatId);
    } else if (text.startsWith("/in") || text.startsWith("/out")) {
      await handleTransaction(c.env, chatId, userId, text);
    } else if (["/daily", "/weekly", "/monthly"].includes(text)) {
      await handleReport(c.env, chatId, userId, text);
    } else if (text.startsWith("/history")) {
      await handleHistory(c.env, chatId, userId, text);
    }
  }

  return c.text("OK");
});

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Bindings,
    _ctx: ExecutionContext,
  ) {
    await handleCron(env);
  },
};
