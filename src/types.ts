export interface Bindings {
  TELEGRAM_BOT_TOKEN: string; // Provided by wrangler secret
  WARNING_THRESHOLD_PERCENT: number; // Provided by wrangler.jsonc
  TIMEZONE_OFFSET: string; // Provided by wrangler.jsonc
  TRACKER_DO: DurableObjectNamespace<import('./durable/TrackerDO').TrackerDO>;
  REGISTRY_DO: DurableObjectNamespace<import('./durable/RegistryDO').RegistryDO>;
}

export type TransactionType = 'income' | 'outcome';

export interface Transaction {
  type: TransactionType;
  method: string;
  amount: number;
  reason: string;
}

export interface TransactionRecord extends Transaction {
  id: number;
  created_at: string;
  t_time?: string;
}

export interface Summary {
  income: number;
  outcome: number;
  net: number;
}
