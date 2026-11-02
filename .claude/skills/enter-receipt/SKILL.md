---
name: enter-receipt
description: Enter store receipts (NFC-e QR links) into the budgeting instance as transactions. Use when the user has a receipt link, or a file of them, to record.
---

Run the CLI as `node cli/app.ts`, since `pnpm app` prints a line that breaks JSON parsing. `node cli/app.ts --help` documents every command used here. `--env .env.instance` is the family's production instance; use another only if the user names it.

## 1. Read

```bash
node cli/app.ts receipts read <file> > /tmp/receipt-report.json
```

The report lists what it couldn't read under `unread`, with the reason, and exits non-zero when there is any.

- **CAPTCHA or access key only**: ask the user to solve the state's lookup and paste the page's text. Take its items, issue date and payments from the paste, and check they add up yourself.
- **Anything else**: tell the user the reason, and carry on with the receipts that were read.

Done when every line of the file is either in `receipts`, pasted by the user, or reported to them.

## 2. Draft the batch

Read what to file things like:

```bash
node cli/app.ts spaces list --env .env.instance
node cli/app.ts accounts list --space <space> --env .env.instance
node cli/app.ts categories examples --space <space> --env .env.instance
```

Write a JSON array to `/tmp/receipt-batch.json`, in the format `transactions add-batch` documents:

- **One row per entry in an item's `rows`**, with the receipt's `date`.
- **`title`**: the item in English, decoded from the receipt's abbreviation, with weight or size and then the brand in parentheses: `Soap 150g (Palmolive)`.
- **`note`**: the store, without its legal suffix.
- **`category`**: where the examples file the nearest thing, searching past titles with `transactions list --search` when they don't settle it. When nothing settles it, take the closest and name it as a doubt in step 3.
- **`account`**: the one in the receipt's currency that its payment method implies: `Dinheiro` a cash account, `Pix` a Pix or bank account. A card, or more than one candidate, is a doubt. A receipt split over several `payments` has rows on each account adding up to that payment.
- **Adjustment**: when the report has an `adjustment`, one more row with its `type`, `amount` and `date`, however many receipts the batch holds, titled for what it nets (`Discount & change not charged`), in the catch-all "other" category of that kind, on the account most of the batch was paid from. A pasted receipt's discount and change difference get netted into it by hand, keeping it one row.

Every field gets your best guess, so the user has only exceptions to correct.

Common abbreviations: `Sab` soap, `Esp Banho` bath sponge, `Pap Hig` toilet paper, `Sh`/`Cond` shampoo/conditioner, `Pao Fat` sliced bread, `Cr Dental` toothpaste, `Desod` deodorant, `Deterg` detergent, `Amac` fabric softener, `Refrig` soda, `Achoc` chocolate drink mix, `L3P2U` buy 3 pay 2.

```bash
node cli/app.ts receipts check --report /tmp/receipt-report.json --batch /tmp/receipt-batch.json
```

Done when the check passes, or the only rows it lists are from pasted receipts.

## 3. Confirm

```bash
node cli/app.ts transactions add-batch /tmp/receipt-batch.json --dry-run --env .env.instance
```

Show the user the dry run as a markdown table, with its balances, and stop for their answer. Under it, ask only what remains open:

- **Change**: for each receipt with `ask_change` true, how much they really got back, since stores round it. If the page shows no change due and they got some, also what they handed over.
- **Doubts**: each title you decoded by guess, and each category or account nothing settled, by name.
- **Duplicates**: any row the dry run marks, which usually means the receipt is already in.

Apply corrections to the batch file. For change, copy the receipts file to `/tmp`, add `change: <amount>` and, when asked, `tendered: <amount>` under the link, and rerun step 1 on the copy, so the report nets the adjustment: its row can change type and category, or disappear. Rerun the check and the dry run after every correction. A row the user removed or added on purpose is the one thing the check may keep listing.

Done when the user has confirmed the latest table.

## 4. Save

```bash
node cli/app.ts transactions add-batch /tmp/receipt-batch.json --env .env.instance
```

Add `--allow-duplicates` only when the user has confirmed the marked rows are new.

If it reports a failure partway, it names how many rows were saved: take those out of the batch file, and run again.

Done when the command prints `Saved`, and you've reported the rows saved and the balances it printed.
