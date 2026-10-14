# Latest rate for balances, transaction-date rate for reports

Balances and net worth are converted to the display currency at the latest exchange rate, because they describe what money is worth now. Reports and budget progress use the rate on each transaction's date, so last March's spending doesn't change as rates move. The same money can therefore show two different converted amounts on different screens; that is deliberate.

Rates come from Frankfurter (ECB data) and are stored in a shared daily table. With no server, the first client to notice today's rates are missing fetches and saves them.

Exchange rates are only ever used for display. Entry never converts: a purchase made in a foreign currency is recorded as the amount the bank statement shows in the account's currency, because that is the only rate that actually applied and the family rarely knows it at the moment of purchase.

The all-time net worth chart converts each point at that day's rate, so its last point equals today's net worth and currency swings show up as the real changes in wealth they are. That needs rates back to the earliest transaction: missing past dates are backfilled into the shared table from Frankfurter's history the first time they're needed.
