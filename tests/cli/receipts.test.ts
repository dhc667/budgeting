import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as z from "zod";

let server: Server;
let pages: Map<string, string>;
let baseUrl: string;
let directory: string;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "receipts-"));
  pages = new Map();
  server = createServer((request, response) => {
    const page = pages.get(request.url ?? "");
    response.statusCode = page === undefined ? 404 : 200;
    response.end(page ?? "");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No port to listen on.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(() => {
  server.close();
});

describe("reading receipts", () => {
  it("reads a real Paraná page, with a row per unit and the note handed over", async () => {
    pages.set("/pr", fixture("nfce-pr.html"));

    const { receipts, adjustment, unread } = (await read(`${baseUrl}/pr\n`)).report;

    expect(unread).toEqual([]);
    expect(adjustment).toBeNull();
    const [receipt] = receipts;
    expect(receipt).toMatchObject({
      store: "Mercado Exemplo Ltda",
      date: "2026-11-02",
      items_total: "59.70",
      to_pay: "59.70",
      payments: [{ method: "Dinheiro", amount: "100.00" }],
      change_due: "40.30",
      change_received: null,
      ask_change: true,
    });
    expect(receipt?.items.map(({ rows }) => rows)).toEqual([
      ["5.17"],
      ["3.99", "3.99"],
      ["9.49"],
      ["16.99"],
      ["11.88"],
      ["1.00"],
      ["7.19"],
    ]);
  });

  it("reads a real Amazonas page, where cash shows as exactly what was due", async () => {
    pages.set("/am", fixture("nfce-am.html"));

    const { receipts, unread } = (await read(`${baseUrl}/am\n`)).report;

    expect(unread).toEqual([]);
    expect(receipts[0]).toMatchObject({
      date: "2026-10-28",
      to_pay: "18.10",
      payments: [{ method: "Dinheiro", amount: "18.10" }],
      change_due: "0.00",
      ask_change: true,
    });
  });

  it("nets a real page's discount into the adjustment as money in the buyer's favour", async () => {
    pages.set("/discount", fixture("nfce-am-discount.html"));

    const { receipts, adjustment } = (await read(`${baseUrl}/discount\n`)).report;

    expect(Number(receipts[0]?.discount)).toBeGreaterThan(0);
    expect(adjustment).toEqual({
      type: "income",
      amount: receipts[0]?.discount,
      date: receipts[0]?.date,
    });
  });

  it("makes one row of what's sold by measure, however round the quantity", async () => {
    pages.set(
      "/a",
      receiptPage({
        items: [item("Arroz", "2,000", "KG", "10,00")],
        toPay: "10,00",
        paid: "10,00",
      }),
    );

    const { receipts } = (await read(`${baseUrl}/a\n`)).report;

    expect(receipts[0]?.items[0]?.rows).toEqual(["10.00"]);
  });

  it("shares out cents a price doesn't divide evenly", async () => {
    pages.set(
      "/a",
      receiptPage({ items: [item("Pack", "3", "UN", "10,00")], toPay: "10,00", paid: "10,00" }),
    );

    const { receipts } = (await read(`${baseUrl}/a\n`)).report;

    expect(receipts[0]?.items[0]?.rows).toEqual(["3.34", "3.33", "3.33"]);
  });

  it("asks about change only where cash was paid", async () => {
    pages.set("/card", receiptPage({ method: "Cartão de Crédito", toPay: "13,15", paid: "13,15" }));
    pages.set("/told", receiptPage());

    const { receipts } = (await read(`${baseUrl}/card\n${baseUrl}/told\nchange: 6.85\n`)).report;

    expect(receipts.map(({ ask_change }) => ask_change)).toEqual([false, false]);
  });

  it("nets discounts and change differences across receipts into one adjustment", async () => {
    pages.set(
      "/rounded-down",
      receiptPage({ items: [item("Pan", "1", "UN", "9,70")], toPay: "9,70", paid: "10,00" }),
    );
    pages.set(
      "/discounted",
      receiptPage({
        items: [item("Sal", "1", "UN", "5,00")],
        discount: "1,00",
        toPay: "4,00",
        paid: "4,00",
        date: "03/11/2026",
      }),
    );

    const { adjustment } = (
      await read(`${baseUrl}/rounded-down\nchange: 0.25\n\n${baseUrl}/discounted\n`)
    ).report;

    expect(adjustment).toEqual({ type: "income", amount: "0.95", date: "2026-11-03" });
  });

  it("makes an adjustment against the buyer an expense", async () => {
    pages.set("/a", receiptPage());

    const { adjustment } = (await read(`${baseUrl}/a\nchange: 6.50\n`)).report;

    expect(adjustment).toEqual({ type: "expense", amount: "0.35", date: "2026-11-02" });
  });

  it("wants what was handed over before counting change the page shows none of", async () => {
    pages.set("/am", fixture("nfce-am.html"));

    const refused = await read(`${baseUrl}/am\nchange: 1.90\n`);
    expect(refused.report.unread[0]?.reason).toContain("tendered");
    expect(refused.exitCode).toBe(1);

    const told = await read(`${baseUrl}/am\ntendered: 20\nchange: 2\n`);
    expect(told.report.unread).toEqual([]);
    expect(told.report.adjustment).toEqual({
      type: "income",
      amount: "0.10",
      date: "2026-10-28",
    });
  });

  it("refuses a receipt that shows less paid than was due", async () => {
    pages.set("/a", receiptPage({ paid: "5,00" }));

    const { report } = await read(`${baseUrl}/a\n`);

    expect(report.unread[0]?.reason).toContain("less than");
  });

  it("refuses a receipt whose items don't add up to what it says", async () => {
    pages.set("/a", receiptPage({ toPay: "99,00" }));

    const { report, exitCode } = await read(`${baseUrl}/a\n`);

    expect(report.unread[0]?.reason).toContain("The items add up to 13.15");
    expect(exitCode).toBe(1);
  });

  it("reports what it can't read beside what it can", async () => {
    const key = "1".repeat(44);
    const closed = "http://127.0.0.1:1/gone";
    pages.set("/a", receiptPage());
    pages.set("/captcha", "<html><body><img src='captcha.png'></body></html>");

    const { report, exitCode } = await read(
      [`${baseUrl}/a`, `${baseUrl}/a`, `${baseUrl}/captcha`, key, closed, `${baseUrl}/404`].join(
        "\n",
      ),
    );

    expect(report.receipts).toHaveLength(1);
    expect(report.unread.map(({ line }) => line)).toEqual([
      `${baseUrl}/a`,
      `${baseUrl}/captcha`,
      key,
      closed,
      `${baseUrl}/404`,
    ]);
    expect(report.unread.map(({ reason }) => reason).slice(0, 3)).toEqual([
      expect.stringContaining("twice"),
      expect.stringContaining("CAPTCHA"),
      expect.stringContaining("CAPTCHA"),
    ]);
    expect(exitCode).toBe(1);
  });

  it("refuses a line that's neither a receipt nor about one", async () => {
    const { stderr, exitCode } = await run(["receipts", "read", fileWith("nonsense\n")]);

    expect(stderr).toContain("Expected a receipt's QR link");
    expect(exitCode).toBe(1);
  });
});

describe("checking a batch against the receipts", () => {
  const row = (amount: string, type = "expense") => ({
    type,
    date: "2026-11-02",
    account: "Cash",
    amount,
    category: "Food",
    title: "Thing",
  });
  const check = async (batch: unknown) => {
    pages.set("/a", receiptPage());
    const { stdout } = await read(`${baseUrl}/a\nchange: 6.50\n`);
    return run([
      "receipts",
      "check",
      "--report",
      fileWith(stdout),
      "--batch",
      fileWith(JSON.stringify(batch)),
    ]);
  };

  it("passes when every unit and the adjustment have their row", async () => {
    const { exitCode } = await check([row("5.17"), row("3.99"), row("3.99"), row("0.35")]);

    expect(exitCode).toBe(0);
  });

  it("names a row dropped, a row mistyped and an adjustment of the wrong type", async () => {
    const { stderr, exitCode } = await check([
      row("5.17"),
      row("3.99"),
      row("3.90"),
      row("0.35", "income"),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("on a receipt, not in the batch: 2026-11-02 expense 3.99");
    expect(stderr).toContain("in the batch, not on a receipt: 2026-11-02 expense 3.90");
    expect(stderr).toContain("in the batch, not on a receipt: 2026-11-02 income 0.35");
  });
});

async function read(file: string) {
  const { stdout, exitCode } = await run(["receipts", "read", fileWith(file)]);
  return { stdout, exitCode, report: report(stdout) };
}

async function run(args: string[]) {
  try {
    const { stdout, stderr } = await promisify(execFile)("node", ["cli/app.ts", ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const { stdout, stderr, code } = failedRun.parse(error);
    return { stdout, stderr, exitCode: code };
  }
}

const failedRun = z.object({ stdout: z.string(), stderr: z.string(), code: z.number() });

let filesWritten = 0;

function fileWith(content: string): string {
  filesWritten += 1;
  const path = join(directory, `file-${filesWritten}`);
  writeFileSync(path, content);
  return path;
}

function fixture(name: string): string {
  return readFileSync(join(dirname(import.meta.filename), "fixtures", name), "utf8");
}

function report(stdout: string) {
  return z
    .object({
      receipts: z.array(
        z.object({
          store: z.string(),
          date: z.string(),
          items: z.array(z.object({ rows: z.array(z.string()) })),
          items_total: z.string(),
          discount: z.string(),
          to_pay: z.string(),
          payments: z.array(z.object({ method: z.string(), amount: z.string() })),
          change_due: z.string(),
          change_received: z.string().nullable(),
          ask_change: z.boolean(),
        }),
      ),
      adjustment: z.object({ type: z.string(), amount: z.string(), date: z.string() }).nullable(),
      unread: z.array(z.object({ line: z.string(), reason: z.string() })),
    })
    .parse(JSON.parse(stdout));
}

function item(name: string, quantity: string, unit: string, total: string): string {
  return `<tr>
    <td>
      <span class="txtTit2">${name}</span>
      <span class="Rqtd"><strong>Qtde.:</strong>${quantity}</span>
      <span class="RUN"><strong>UN: </strong>${unit}</span>
    </td>
    <td class="txtTit3"><span class="valor">${total}</span></td>
  </tr>`;
}

// The cases the saved pages don't happen to show, in the layout they share.
function receiptPage({
  items = [item("Pepino Kg", "0,74", "KG", "5,17"), item("Sab Lux", "2", "UN", "7,98")],
  discount,
  toPay = "13,15",
  paid = "20,00",
  method = "Dinheiro",
  date = "02/11/2026",
}: {
  items?: string[];
  discount?: string;
  toPay?: string;
  paid?: string;
  method?: string;
  date?: string;
} = {}): string {
  const line = (label: string, value: string) =>
    `<div id="linhaTotal"><label>${label}</label><span class="totalNumb">${value}</span></div>`;
  return `<html><body>
    <div class="txtTopo">Mercado Exemplo Ltda</div>
    <table id="tabResult">${items.join("")}</table>
    <div id="totalNota">
      ${discount === undefined ? "" : line("Descontos R$:", discount)}
      ${line("Valor a pagar R$:", toPay)}
      ${line("Forma de pagamento:", "Valor pago R$:")}
      ${line(method, paid)}
      ${line("Troco", "NaN")}
    </div>
    <ul><li><strong>Emissão: </strong>${date} 10:30:56 - Via Consumidor</li></ul>
  </body></html>`;
}
