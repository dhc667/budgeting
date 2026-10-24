# Money given or received may move a debt in another currency

A family paid back in pesos for a debt agreed in dollars had to record it as two forgiven debts, one per currency, which counted as spending and income that never happened. Money given or received now has two sides that may be in different currencies, each with its own amount, as a cross-currency transfer does (ADR 0002): what left or reached the account, in the account's currency, and what it changed in the debt, in the debt's. Lending, borrowing and paying back all may cross currencies. The user types both amounts; the app never converts at a rate (ADR 0008), since the rate that applied is whatever the family and the counterparty agreed.

## Considered options

- **The forgiven pair, made easier to enter**: still records spending in one currency and income in the other, and counts in budgets and reports.
- **The debt amount worked out from the day's rate**: rarely the rate the two sides agreed on, and entry never converts.

## Consequences

- A debt is still one balance per currency (ADR 0013); money given or received moves the balance in the currency of its counterparty side, whatever the account's.
- A forgiven debt stays within one currency (ADR 0014): forgiving across currencies would need an amount for money that never moved. A debt in a currency none of the space's open accounts hold can be paid off in another currency but not forgiven.
