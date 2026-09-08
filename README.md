# Mafund — Telegram Finance Tracker

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![Durable Objects](https://img.shields.io/badge/Durable_Objects-SQLite-F38020)](https://developers.cloudflare.com/durable-objects/)

A **fast, lightweight, serverless** personal finance tracker for Telegram — running entirely on **Cloudflare Workers + Hono + Durable Objects (SQLite)**. No external database, no servers to maintain.

Each user gets isolated storage, daily/weekly/monthly reports, overspending warnings, and an automatic midnight recap (Western Indonesia Time, WIB / UTC+7).

---

## Features

| Feature | Description |
|---|---|
| Log income & expenses | `/in` and `/out` with payment method, amount, and free-text reason |
| Smart overspending warning | Automatic warning when a single expense reaches a threshold (% of balance) |
| Instant reports | `/daily`, `/weekly`, `/monthly` — income, outcome, and net summaries |
| Interactive history | `/history` with Older/Newer button pagination + specific-date query (`/history YYYY-MM-DD`) |
| Automatic midnight summary | Cron job every 00:00 WIB, sent only to users active that day, with a *Show Transactions* button |
| Per-user data isolation | 1 Durable Object per Telegram `userId` — data never leaks across users |
| Timezone-aware (WIB) | All date aggregations use a `+7 hours` offset to stay consistent with Indonesia time |

---

## Bot Commands

| Command | Example | Description |
|---|---|---|
| `/start`, `/help` | `/start` | Show usage guide |
| `/in [method] [amount] [reason]` | `/in bca 5000000 september salary` | Log income |
| `/out [method] [amount] [reason]` | `/out cash 50000 lunch` | Log an expense |
| `/daily` | `/daily` | Last 1 day summary |
| `/weekly` | `/weekly` | Last 7 days summary |
| `/monthly` | `/monthly` | Last 30 days summary |
| `/history` | `/history` | History grouped by date + Newer / Older navigation buttons |
| `/history YYYY-MM-DD` | `/history 2026-09-08` | History for a specific date |

Example interaction:

```text
User: /out cash 50000 lunch with friends

Bot:  OUTCOME recorded.
      Amount: 50000
      Method: cash
      Reason: lunch with friends

Bot:  WARNING: This outcome (500000) is 35.2% of your balance (1420000)!
      (sent automatically when the threshold is exceeded)
```

---

## Architecture

```text
                    +----------------+
                    |    Telegram    |
                    |    Bot API     |
                    +-------+--------+
                            | update (message / callback_query)
                            v
                  +---------------------+
                  |     Cloudflare      |
                  |     Worker (Hono)   |
                  |     POST /webhook   |
                  +-----+----------+----+
                        |          |
           +------------+          +-------------+
           v                                     v
 +------------------+                 +-------------------+
 |    TrackerDO     |                 |    RegistryDO     |
 |   (per userId)   |                 | (global singleton)|
 |   SQLite:        |                 |   SQLite:         |
 |   transactions   |<--- register ---|   users           |
 +------------------+                 +-------------------+
        ^
        |  Cron 00:00 WIB (0 17 * * * UTC)
        |  handleCron() -> midnight summary
        |  to all registered active users
```

**Request flow:**

1. Telegram sends an update to `POST /webhook`.
2. `src/index.ts` routes by type:
   - `callback_query` -> `handleCallback` (history pagination, *Show Transactions* button)
   - `/start`, `/help` -> `handleHelp`
   - `/in`, `/out` -> `handleTransaction`
   - `/daily`, `/weekly`, `/monthly` -> `handleReport`
   - `/history` -> `handleHistory`
3. Transactions are stored and read via RPC to the user's own `TrackerDO` (`idFromName(userId)`).
4. Every new transaction registers the user in `RegistryDO` (`global_registry`) so they receive the midnight summary.
5. The daily cron trigger (`scheduled`) calls `handleCron` -> fetches yesterday's transactions (WIB) per user -> sends the recap.

**Durable Objects:**

| Object | Scope | Table | Methods |
|---|---|---|---|
| `TrackerDO` | 1 instance per `userId` | `transactions(id, type, method, amount, reason, created_at)` | `getBalance`, `addTransaction`, `getSummaryByPeriod`, `getHistoryDateByOffset`, `getTransactionsByDate` |
| `RegistryDO` | 1 global instance (`global_registry`) | `users(id)` | `registerUser`, `getAllUsers` |

---

## Tech Stack

- **Runtime:** Cloudflare Workers
- **Framework:** [Hono](https://hono.dev/) v4 (routing + Telegram webhook)
- **Language:** TypeScript (strict)
- **Storage:** Durable Objects + SQLite (`storage.sql`)
- **Scheduler:** Workers Cron Triggers
- **Messaging:** Telegram Bot API (`sendMessage`, `editMessageText`, inline keyboards, `parse_mode: HTML`)
- **Deploy tooling:** Wrangler v4

---

## Project Structure

```text
mafund/
├── src/
│   ├── index.ts               # Entry point: Hono app, /webhook routing + scheduled cron
│   ├── types.ts               # Bindings, Transaction, Summary types
│   ├── durable/
│   │   ├── TrackerDO.ts       # Per-user DO: ledger + report queries
│   │   └── RegistryDO.ts      # Global DO: userId registry for cron broadcast
│   ├── handlers/
│   │   ├── commands.ts        # /start, /help, /in, /out, /daily, /weekly, /monthly, /history
│   │   ├── callbacks.ts       # callback_query: history_* and show_date_*
│   │   └── cron.ts            # daily midnight summary
│   └── services/
│       └── telegram.ts        # fetch wrapper for the Telegram Bot API
├── wrangler.jsonc             # Worker config: cron, vars, DO bindings
├── package.json
└── tsconfig.json
```

---

## Configuration

`wrangler.jsonc`:

| Key | Default | Description |
|---|---|---|
| `triggers.crons` | `0 17 * * *` | = 00:00 WIB (17:00 UTC). Midnight summary schedule |
| `vars.WARNING_THRESHOLD_PERCENT` | `30` | Warning threshold: an expense >= 30% of balance triggers a warning |
| `vars.TIMEZONE_OFFSET` | `+7 hours` | WIB offset for SQLite date functions |
| `durable_objects.bindings` | `TRACKER_DO`, `REGISTRY_DO` | DO namespace bindings |

> Date queries in `TrackerDO` use `DATE(created_at, '+7 hours')` / `TIME(created_at, '+7 hours')` so days are counted in WIB, not UTC.

**Secrets (never committed to the repo):**

| Secret | How to set | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `wrangler secret put TELEGRAM_BOT_TOKEN` | Token from [@BotFather](https://t.me/BotFather) |

---

## Getting Started

### Prerequisites

- Node.js 18+ and `pnpm` (or `npm`)
- A Cloudflare account + [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) logged in (`wrangler login`)
- A Telegram bot from [@BotFather](https://t.me/BotFather) (to get the token)

### 1. Install dependencies

```bash
pnpm install
# or
npm install
```

### 2. Set the bot token (production)

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
```

For local development, create a `.dev.vars` file (already in `.gitignore`):

```dotenv
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
```

### 3. Run locally

```bash
pnpm dev
# or
npm run dev
```

Wrangler will give you a local URL (e.g. `http://localhost:8787`). To receive Telegram updates during development, expose it via a tunnel and set the webhook:

```bash
# example with cloudflared
cloudflared tunnel --url http://localhost:8787

curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<tunnel-url>/webhook"
```

### 4. Deploy to Cloudflare

```bash
pnpm deploy
# or
npm run deploy
```

Then point the Telegram webhook to the production Worker:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://mafund.<subdomain>.workers.dev/webhook"
```

Verify:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### 5. (Optional) Regenerate binding types

```bash
npm run cf-typegen
```

---

## Cron — Midnight Summary

- Schedule: `0 17 * * *` (UTC cron) -> **00:00 WIB**.
- Implementation: `src/handlers/cron.ts` -> `handleCron()`.
- Behavior:
  - Computes `targetDate` = yesterday in WIB.
  - Loads all users from `RegistryDO`.
  - Only sends a message to users who **had transactions** on that date (saves quota, no spam).
  - The message contains income / outcome / net + an inline `Show Transactions` button (`callback_data: show_date_YYYY-MM-DD`).
- To change the schedule, edit `triggers.crons` in `wrangler.jsonc` and redeploy.

---

## Security & Limitations

- **Bot token** is stored only as a Wrangler secret / `.dev.vars` — never commit it.
- **Data isolation:** `TrackerDO.idFromName(userId)` keeps each user's ledger separated at the storage level.
- **Input validation:** amounts are parsed with `parseFloat`; `/history` dates are validated with a `YYYY-MM-DD` regex.
- **Current limitations:** no extra authentication on `/webhook` (anyone who knows the URL can POST) — consider verifying Telegram's `secret_token` in production. No edit/delete transaction feature yet.

---

## Roadmap

- [ ] Verify `X-Telegram-Bot-Api-Secret-Token` on the webhook
- [ ] Edit & delete transactions (`/edit`, `/del`)
- [ ] Categories & monthly budgets (`/budget`, `/top`)
- [ ] CSV export / automatic monthly recap
- [ ] Multi-language support (ID / EN)

---

## Contributing

1. Fork this repository.
2. Create a branch: `git checkout -b feat/my-feature`.
3. Commit with a clear message.
4. Open a Pull Request.

Make sure `pnpm dev` runs without errors before submitting a PR.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
