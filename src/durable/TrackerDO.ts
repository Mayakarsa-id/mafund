import { DurableObject } from 'cloudflare:workers';
import { Transaction, TransactionRecord, Summary } from '../types';

export class TrackerDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT CHECK(type IN ('income', 'outcome')) NOT NULL,
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async getBalance(): Promise<number> {
    const result = this.ctx.storage.sql.exec(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type = 'outcome' THEN amount ELSE 0 END), 0) as balance
      FROM transactions
    `).toArray();
    return (result[0] as any)?.balance ?? 0;
  }

  async addTransaction(tx: Transaction): Promise<boolean> {
    this.ctx.storage.sql.exec(
      "INSERT INTO transactions (type, method, amount, reason) VALUES (?, ?, ?, ?)",
      tx.type, tx.method, tx.amount, tx.reason
    );
    return true;
  }

  async getSummaryByPeriod(timeModifier: string): Promise<Summary> {
    const results = this.ctx.storage.sql.exec(`
      SELECT type, SUM(amount) as total
      FROM transactions
      WHERE created_at >= datetime('now', ?, '+7 hours')
      GROUP BY type
    `, timeModifier).toArray();

    const summary = { income: 0, outcome: 0, net: 0 };
    results.forEach((r: any) => {
      if (r.type === 'income') summary.income = r.total;
      if (r.type === 'outcome') summary.outcome = r.total;
    });
    summary.net = summary.income - summary.outcome;
    return summary;
  }

  async getHistoryDateByOffset(offset: number): Promise<string | null> {
    const result = this.ctx.storage.sql.exec(`
      SELECT DATE(created_at, '+7 hours') as t_date
      FROM transactions
      GROUP BY t_date
      ORDER BY t_date DESC
      LIMIT 1 OFFSET ?
    `, offset).toArray();
    return result.length > 0 ? (result[0] as any).t_date : null;
  }

  async getTransactionsByDate(dateStr: string): Promise<TransactionRecord[]> {
    return this.ctx.storage.sql.exec(`
      SELECT type, amount, reason, method, TIME(created_at, '+7 hours') as t_time
      FROM transactions
      WHERE DATE(created_at, '+7 hours') = ?
      ORDER BY created_at DESC
    `, dateStr).toArray() as unknown as TransactionRecord[];
  }
}
