# Amounts are integers in each currency's minor units

Every amount is stored as a whole number of the currency's minor units: cents for USD and BRL, yen as they are, thousandths for KWD, with each currency's number of decimals kept beside its code. Sums, balances and the zero-sum check on postings are then exact, and the browser never does floating-point arithmetic on money. JavaScript numbers hold integers exactly up to 2^53, far beyond any family's balance in any currency's minor units.

## Considered options

- **Exact decimals (`numeric`)**: rejected. It only adds precision below the minor unit, which no bank statement shows, and every amount would reach the browser as a string needing a decimal library.
