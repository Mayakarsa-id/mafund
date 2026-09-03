import { DurableObject } from 'cloudflare:workers';

export class RegistryDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY
      );
    `);
  }

  async registerUser(userId: number): Promise<void> {
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO users (id) VALUES (?)", userId);
  }

  async getAllUsers(): Promise<number[]> {
    const results = this.ctx.storage.sql.exec("SELECT id FROM users").toArray();
    return results.map((row: any) => row.id);
  }
}
