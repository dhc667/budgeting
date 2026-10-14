# Recurring transactions wait for a member to mark them paid

A recurring transaction produces upcoming transactions that don't touch balances until a member marks them paid, adjusting the amount if it differs. We chose this, as Cashew does, over posting automatically with pg_cron: variable bills need their real amount, and a charge that posts silently but never actually happened makes balances quietly drift from reality. Automatic posting could later be added as a per-rule option.
