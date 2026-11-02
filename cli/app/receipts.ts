import { readFile } from "node:fs/promises";
import { type CheerioAPI, load } from "cheerio";
import * as z from "zod";
import { fail, messageOf } from "../fail.ts";
import { type Commands, onlyPositional, parseCommand, required } from "./command.ts";
import { parseAmount, wholeUnits } from "./money.ts";
import { batchFile } from "./transactions.ts";

export const receiptCommands: Commands = {
  "receipts read": readReceipts,
  "receipts check": checkBatch,
};

// Only reads the tax authority's pages: nothing here needs a session or touches the instance. One
// receipt that can't be read doesn't hide the others, but still ends in a failing exit code.
async function readReceipts(argv: string[]) {
  const { positionals } = parseCommand(argv, {});
  const file = onlyPositional(positionals, "receipts read <file>");
  const receipts: Receipt[] = [];
  const unread: Report["unread"] = [];
  const seen = new Set<string>();
  for (const line of receiptLinesIn(await readFile(file, "utf8"))) {
    try {
      if (seen.has(line.source)) throw new Error("It's in the file twice; this one was skipped.");
      seen.add(line.source);
      receipts.push(receiptFrom(await pageAt(line.source), line));
    } catch (error) {
      unread.push({ line: line.source, reason: messageOf(error) });
    }
  }
  console.log(JSON.stringify(reportOf(receipts, unread), null, 2));
  if (unread.length > 0) process.exitCode = 1;
}

// Catches a row dropped or mistyped between the report and the batch, which add-batch can't see.
async function checkBatch(argv: string[]) {
  const { values } = parseCommand(argv, {
    report: { type: "string" },
    batch: { type: "string" },
  });
  const report = reportFile.parse(await jsonIn(required(values.report, "--report")));
  const batch = batchFile.parse(await jsonIn(required(values.batch, "--batch")));
  const expected = report.receipts.flatMap(({ date, items }) =>
    items.flatMap(({ rows }) => rows.map((amount) => rowKey("expense", date, amount))),
  );
  if (report.adjustment) {
    const { type, date, amount } = report.adjustment;
    expected.push(rowKey(type, date, amount));
  }
  const written = batch.map(({ type, date, amount }) => rowKey(type, date, amount));
  const missing = withoutEach(expected, written);
  const extra = withoutEach(written, expected);
  if (missing.length > 0 || extra.length > 0) {
    fail(
      [
        "The batch doesn't match the receipts.",
        ...missing.map((row) => `  on a receipt, not in the batch: ${row}`),
        ...extra.map((row) => `  in the batch, not on a receipt: ${row}`),
      ].join("\n"),
    );
  }
  console.log(`The batch matches the receipts: ${written.length} rows.`);
}

async function jsonIn(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

function rowKey(type: string, date: string, amount: string): string {
  return `${date} ${type} ${amountText(parseAmount(amount, "amount", brl))}`;
}

function withoutEach(from: string[], taken: string[]): string[] {
  const left = [...from];
  for (const item of taken) {
    const found = left.indexOf(item);
    if (found >= 0) left.splice(found, 1);
  }
  return left;
}

function receiptLinesIn(file: string): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  for (const text of file.split("\n").map((line) => line.trim())) {
    const stated = /^(change|tendered):\s*(\d+(?:\.\d+)?)$/.exec(text);
    const last = lines.at(-1);
    if (text === "") continue;
    if (/^https?:\/\//.test(text) || /^\d{44}$/.test(text.replaceAll(" ", ""))) {
      lines.push({ source: text, changeReceived: null, tendered: null });
    } else if (stated?.[2] !== undefined && last) {
      const amount = parseAmount(stated[2], stated[1] ?? "", brl, { signed: true });
      if (stated[1] === "change") last.changeReceived = amount;
      else last.tendered = amount;
    } else {
      fail(`Expected a receipt's QR link or "change: 40.30" under one, and got: ${text}`);
    }
  }
  if (lines.length === 0) fail("No receipts in that file.");
  return lines;
}

async function pageAt(source: string): Promise<string> {
  if (!source.startsWith("http")) {
    throw new Error("Only an access key: its page sits behind the state's CAPTCHA.");
  }
  // The state portals turn away clients that don't look like a browser.
  const response = await fetch(source, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`The portal answered ${response.status}.`);
  return response.text();
}

function receiptFrom(html: string, line: ReceiptLine): Receipt {
  const page = load(html);
  const items = itemsOn(page);
  const totals = totalLinesOn(page);
  const itemsTotal = sum(items.flatMap(({ rows }) => rows));
  const discount = amountOn(totals, "Descontos") ?? 0;
  const toPay = amountOn(totals, "Valor a pagar");
  if (toPay === null) throw new Error("The page shows no amount to pay.");
  if (itemsTotal - discount !== toPay) {
    throw new Error(
      `The items add up to ${amountText(itemsTotal)} less ${amountText(discount)} of discount, and the receipt says ${amountText(toPay)}.`,
    );
  }
  const payments = paymentsOn(totals);
  const tendered = line.tendered ?? sum(payments.map(({ amount }) => amount));
  checkChange(tendered, toPay, line.changeReceived);
  return {
    store: page(".txtTopo").first().text().trim(),
    date: issueDateOn(page),
    items,
    itemsTotal,
    discount,
    toPay,
    payments,
    tendered,
    changeReceived: line.changeReceived,
  };
}

function itemsOn(page: CheerioAPI): Item[] {
  const items = page("#tabResult tr")
    .toArray()
    .map((row) => {
      const cell = (selector: string) => page(row).find(selector).first();
      const quantity = afterLabel(cell(".Rqtd").text()).replace(",", ".");
      const unit = afterLabel(cell(".RUN").text());
      return {
        name: cell(".txtTit, .txtTit2").text().trim(),
        quantity,
        unit,
        rows: unitRows(centsOf(cell(".valor").text()), quantity, unit),
      };
    });
  if (items.length === 0) throw new Error("No items on that page; it may want a CAPTCHA.");
  return items;
}

function afterLabel(cellText: string): string {
  return cellText.replace(/^.*:/s, "").trim();
}

// A whole number of things is that many rows, sharing out cents a price doesn't divide evenly.
// What's sold by measure is one row, however round the quantity.
function unitRows(total: number, quantity: string, unit: string): number[] {
  const count = Number(quantity);
  if (!Number.isInteger(count) || count < 2 || measures.includes(unit.toUpperCase())) {
    return [total];
  }
  const each = Math.floor(total / count);
  const left = total - each * count;
  return Array.from({ length: count }, (_, i) => each + (i < left ? 1 : 0));
}

const measures = ["KG", "G", "GR", "L", "LT", "ML", "M", "MT", "M2", "M3"];

function totalLinesOn(page: CheerioAPI): TotalLine[] {
  return page("#totalNota > div")
    .toArray()
    .map((line) => ({
      label: page(line).find("label").text().trim(),
      value: page(line).find(".totalNumb").text().trim(),
    }));
}

function amountOn(totals: TotalLine[], label: string): number | null {
  const value = totals.find((line) => line.label.startsWith(label))?.value;
  return value === undefined ? null : centsOf(value);
}

function paymentsOn(totals: TotalLine[]): Payment[] {
  const first = totals.findIndex((line) => line.label.startsWith("Forma de pagamento")) + 1;
  // Troco is often NaN, and tells nothing the payments don't.
  const payments = totals
    .slice(first)
    .filter((line) => !/^(Troco|Informa)/.test(line.label))
    .map((line) => ({ method: line.label, amount: centsOf(line.value) }));
  if (first === 0 || payments.length === 0) throw new Error("The page shows no payment.");
  return payments;
}

// Some pages record cash as exactly the amount due, whatever was handed over: change on those can't
// be told from money appearing unless the note given is stated too.
function checkChange(tendered: number, toPay: number, changeReceived: number | null) {
  if (tendered < toPay) {
    throw new Error(`${amountText(tendered)} paid is less than the ${amountText(toPay)} due.`);
  }
  if (changeReceived !== null && changeReceived > 0 && tendered === toPay) {
    throw new Error(
      `The page shows ${amountText(tendered)} paid with none due back; add "tendered: <amount>" under the link, with what was handed over.`,
    );
  }
}

function issueDateOn(page: CheerioAPI): string {
  const [, day, month, year] =
    /Emiss[ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(page.root().text()) ?? [];
  if (!day || !month || !year) throw new Error("The page shows no issue date.");
  return `${year}-${month}-${day}`;
}

function reportOf(receipts: Receipt[], unread: Report["unread"]): Report {
  return {
    receipts: receipts.map((receipt) => ({
      store: receipt.store,
      date: receipt.date,
      items: receipt.items.map((item) => ({ ...item, rows: item.rows.map(amountText) })),
      items_total: amountText(receipt.itemsTotal),
      discount: amountText(receipt.discount),
      to_pay: amountText(receipt.toPay),
      payments: receipt.payments.map(({ method, amount }) => ({
        method,
        amount: amountText(amount),
      })),
      tendered: amountText(receipt.tendered),
      change_due: amountText(receipt.tendered - receipt.toPay),
      change_received: receipt.changeReceived === null ? null : amountText(receipt.changeReceived),
      ask_change:
        receipt.changeReceived === null &&
        receipt.payments.some(({ method }) => /dinheiro/i.test(method)),
    })),
    adjustment: adjustmentOf(receipts),
    unread,
  };
}

// Discounts, and whatever change differed from what was due, netted over the whole file and dated
// by its last receipt. Change not stated is taken as exact.
function adjustmentOf(receipts: Receipt[]): Report["adjustment"] {
  const net = sum(
    receipts.map(
      ({ discount, tendered, toPay, changeReceived }) =>
        discount + (changeReceived === null ? 0 : changeReceived - (tendered - toPay)),
    ),
  );
  const date = receipts
    .map((receipt) => receipt.date)
    .sort()
    .at(-1);
  if (net === 0 || date === undefined) return null;
  return { type: net > 0 ? "income" : "expense", amount: amountText(Math.abs(net)), date };
}

function centsOf(brazilian: string): number {
  const match = /^((?:\d{1,3}(?:\.\d{3})+)|\d+)(?:,(\d{1,2}))?$/.exec(brazilian.trim());
  if (!match) throw new Error(`The page has an amount that can't be read: "${brazilian}".`);
  const [, whole = "", fraction = ""] = match;
  return Number(`${whole.replaceAll(".", "")}${fraction.padEnd(brl.decimals, "0")}`);
}

function amountText(cents: number): string {
  return wholeUnits(cents, brl.decimals).toFixed(brl.decimals);
}

function sum(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

// NFC-e is Brazilian: its amounts are always in reais.
const brl = { code: "BRL", decimals: 2 };

const reportFile = z.object({
  receipts: z.array(
    z.object({
      store: z.string(),
      date: z.string(),
      items: z.array(
        z.object({
          name: z.string(),
          quantity: z.string(),
          unit: z.string(),
          rows: z.array(z.string()),
        }),
      ),
      items_total: z.string(),
      discount: z.string(),
      to_pay: z.string(),
      payments: z.array(z.object({ method: z.string(), amount: z.string() })),
      tendered: z.string(),
      change_due: z.string(),
      change_received: z.string().nullable(),
      ask_change: z.boolean(),
    }),
  ),
  adjustment: z
    .object({ type: z.enum(["income", "expense"]), amount: z.string(), date: z.string() })
    .nullable(),
  unread: z.array(z.object({ line: z.string(), reason: z.string() })),
});

type Report = z.infer<typeof reportFile>;

type ReceiptLine = { source: string; changeReceived: number | null; tendered: number | null };

type TotalLine = { label: string; value: string };

type Payment = { method: string; amount: number };

type Item = { name: string; quantity: string; unit: string; rows: number[] };

type Receipt = {
  store: string;
  date: string;
  items: Item[];
  itemsTotal: number;
  discount: number;
  toPay: number;
  payments: Payment[];
  tendered: number;
  changeReceived: number | null;
};
