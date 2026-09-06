export type BudgetRow = {
  month: unknown;
  accountKey: string;
  budget: string;
  accountName: string;
  amount: number | null;
  active: string;
  notes: string;
  updatedAt: unknown;
};

export type BankMessage = {
  id: string;
  bank: string;
  from: string;
  subject: string;
  date: string;
  amount: number | null;
  operationType: string;
  preview: string;
};

export type BudgetsResponse = {
  ok: boolean;
  sheet: string;
  rows: unknown[][];
  rowCount: number;
};

export type GmailUnreadResponse = { ok: boolean; unread: number };
export type BankMessagesResponse = { ok: boolean; messages: BankMessage[] };
