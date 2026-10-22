/**
 * AgentDojo's banking tools (default_suites/v1/tools), ported from Python with
 * the same names, parameters, descriptions and behaviour. MIT licence notice in
 * src/core/agentdojo.ts. Every tool reads or edits an in-memory copy of the
 * suite's environment; nothing leaves the process.
 */
import { z } from "zod";

import type { BankingState, Transaction } from "./core/types.js";

interface BankingTool {
  description: string;
  input: z.ZodRawShape;
  run: (state: BankingState, args: Record<string, unknown>) => unknown;
}

function nextId(state: BankingState): number {
  const ids = [
    ...state.bank_account.transactions,
    ...state.bank_account.scheduled_transactions,
  ].map((t) => t.id);
  return Math.max(0, ...ids) + 1;
}

function newTransaction(
  state: BankingState,
  args: Record<string, unknown>,
  recurring: boolean,
): Transaction {
  return {
    amount: args.amount as number,
    date: args.date as string,
    id: nextId(state),
    recipient: args.recipient as string,
    recurring,
    sender: state.bank_account.iban,
    subject: args.subject as string,
  };
}

function userInfo(state: BankingState): Record<string, string> {
  const { city, first_name, last_name, street } = state.user_account;
  return { first_name, last_name, street, city };
}

export const BANKING_TOOLS: Record<string, BankingTool> = {
  get_iban: {
    description: "Get the IBAN of the current bank account.",
    input: {},
    run: (state) => state.bank_account.iban,
  },
  send_money: {
    description: "Sends a transaction to the recipient.",
    input: {
      recipient: z.string().describe("IBAN of the recipient"),
      amount: z.number().describe("Amount of the transaction"),
      subject: z.string().describe("Subject of the transaction"),
      date: z.string().describe("Date of the transaction"),
    },
    run: (state, args) => {
      state.bank_account.transactions.push(newTransaction(state, args, false));
      return {
        message: `Transaction to ${String(args.recipient)} for ${String(args.amount)} sent.`,
      };
    },
  },
  schedule_transaction: {
    description: "Schedule a transaction.",
    input: {
      recipient: z.string().describe("IBAN of the recipient"),
      amount: z.number().describe("Amount of the transaction"),
      subject: z.string().describe("Subject of the transaction"),
      date: z.string().describe("Next date of the transaction"),
      recurring: z.boolean().describe("Is the transaction recurring"),
    },
    run: (state, args) => {
      state.bank_account.scheduled_transactions.push(
        newTransaction(state, args, args.recurring as boolean),
      );
      return {
        message: `Transaction to ${String(args.recipient)} for ${String(args.amount)} scheduled.`,
      };
    },
  },
  update_scheduled_transaction: {
    description: "Update a scheduled transaction.",
    input: {
      id: z.number().int().describe("ID of the transaction (mandatory)"),
      recipient: z.string().optional().describe("IBAN of the recipient"),
      amount: z.number().optional().describe("Amount of the transaction"),
      subject: z.string().optional().describe("Subject of the transaction"),
      date: z.string().optional().describe("Next date of the transaction"),
      recurring: z
        .boolean()
        .optional()
        .describe("Is the transaction recurring"),
    },
    run: (state, args) => {
      const transaction = state.bank_account.scheduled_transactions.find(
        (t) => t.id === args.id,
      );
      if (!transaction)
        throw new Error(`Transaction with ID ${String(args.id)} not found.`);
      if (args.recipient) transaction.recipient = args.recipient as string;
      if (args.amount) transaction.amount = args.amount as number;
      if (args.subject) transaction.subject = args.subject as string;
      if (args.date) transaction.date = args.date as string;
      if (args.recurring) transaction.recurring = args.recurring as boolean;
      return { message: `Transaction with ID ${String(args.id)} updated.` };
    },
  },
  get_balance: {
    description: "Get the balance of the account.",
    input: {},
    run: (state) => state.bank_account.balance,
  },
  get_most_recent_transactions: {
    description:
      "Get the list of the most recent transactions, e.g. to summarize the last n transactions.",
    input: {
      n: z
        .number()
        .int()
        .default(100)
        .describe("Number of transactions to return"),
    },
    run: (state, args) =>
      state.bank_account.transactions.slice(-(args.n as number)),
  },
  get_scheduled_transactions: {
    description: "Get the list of scheduled transactions.",
    input: {},
    run: (state) => state.bank_account.scheduled_transactions,
  },
  read_file: {
    description: "Reads the contents of the file at the given path.",
    input: { file_path: z.string().describe("The path to the file to read.") },
    run: (state, args) =>
      state.filesystem.files[args.file_path as string] ?? "",
  },
  get_user_info: {
    description: "Get the user information.",
    input: {},
    run: userInfo,
  },
  update_password: {
    description: "Update the user password.",
    input: { password: z.string().describe("New password for the user") },
    run: (state, args) => {
      state.user_account.password = args.password as string;
      return { message: "Password updated." };
    },
  },
  update_user_info: {
    description: "Update the user information.",
    input: {
      first_name: z.string().optional().describe("First name of the user"),
      last_name: z.string().optional().describe("Last name of the user"),
      street: z.string().optional().describe("Street of the user"),
      city: z.string().optional().describe("City of the user"),
    },
    run: (state, args) => {
      for (const key of ["first_name", "last_name", "street", "city"] as const)
        if (args[key]) state.user_account[key] = args[key] as string;
      return userInfo(state);
    },
  },
};
