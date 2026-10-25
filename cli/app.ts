import { fail, messageOf } from "./fail.ts";
import { accountCommands } from "./app/accounts.ts";
import { categoryCommands } from "./app/categories.ts";
import { counterpartyCommands } from "./app/counterparties.ts";
import type { Commands } from "./app/command.ts";
import { sessionCommands } from "./app/session.ts";
import { spaceCommands } from "./app/spaces.ts";
import { transactionCommands } from "./app/transactions.ts";

const usage = `Usage: pnpm app <command> [options] [--env <file>]

Uses the app as the signed-in user: the same rules apply as on their phone, and what they can't
see or change, neither can these commands. Dates are like 2026-10-18 and default to today.

Naming things:
  Wherever a space, account, category or counterparty goes, give its name or its id. Names match
  whatever their case or spacing. A category goes by its path, Food/Necessary; a bare name is a
  top-level one. --space private is your private space. An id can be cut short to any start of
  it 8 characters or longer, as lists show it; transactions go by id alone. A name or id that
  could mean more than one thing is refused, with the candidates listed.
  On a transaction, --category and --counterparty are looked up in its account's space, and
  accounts in all your spaces, since a transfer can cross them.

Amounts:
  In whole units of their currency, as people write them: --amount 3477.23, and 1250 is 1250.00.
  Each is in its own account's currency: --amount the account's, --to-amount the other account's,
  --debt-amount --debt-currency's. One below zero goes after an equals sign:
  --opening-amount=-2500.

Output:
  A table on a terminal; when piped, tab-separated lines with a header row.
  --json                 List the fields a command has, without running it
  --json <f1,f2,...>     Print those fields as JSON, nulls included
  --quiet                On add, update and restore print only the id; on delete, nothing

Session:
  login [--email <email>] [--password-stdin]   Sign in; asks for the password unless piped in
  logout                                       End this session (other devices stay signed in)
  whoami                                       Who is signed in, and where

Spaces:
  spaces list
  spaces add --name <name>                     Just you in it; add members from the app

Accounts (--space defaults to your private space):
  accounts list [--space <space>] [--archived]
  accounts add --name <name> --currency <code> [--space <space>] [--color <color>]
      [--opening-amount <amount>] [--opening-date <date>]
  accounts update <account> [--name ...] [--currency ...] [--color ...] [--opening-amount ...]
      [--opening-date ...]
  accounts archive <account> | accounts unarchive <account>
  accounts delete <account>

Categories (--space defaults to your private space):
  categories list [--space <space>] [--kind expense|income]
  categories add --name <name> [--kind expense|income] [--space <space>] [--icon <lucide name>]
      [--color <color>] [--parent <category>]
  categories update <category> [--name ...] [--kind ...] [--icon ...] [--color ...]
      [--parent <category> | --no-parent]
  categories delete <category> [--move-to <category>]
  --parent is looked up in the category's space, and a subcategory is of its parent's kind, so
  --kind is needed only for a top-level one. --move-to is looked up in the category's space and
  kind. A category with subcategories can't be deleted. One that transactions or recurring transactions use needs
  --move-to, where they go; deleted transactions don't count. Built-in categories take only
  forgiven debts: they keep their kind and place, and can't be deleted.

Counterparties: whoever money is lent to or borrowed from (--space defaults to your private space):
  counterparties list [--space <space>]        With what each owes per currency (below zero, you owe)
  counterparties add --name <name> [--space <space>] [--color <color>]
  counterparties update <counterparty> [--name ...] [--color ...]
  counterparties delete <counterparty>         Only one that no transaction uses

Transactions:
  transactions list [--space <space>] [--account <account>] [--category <category>]
      [--counterparty <counterparty>] [--from <date>] [--to <date>] [--search <text>]
      [--limit <n>]
  transactions show <transaction>
  transactions add --type expense|refund|income|transfer|given|received|forgave|forgiven
      --account <account> --amount <amount> [--category <category>] [--to-account <account>]
      [--to-amount <amount>] [--counterparty <counterparty>]
      [--debt-currency <code> --debt-amount <amount>] [--date <date>] [--title <text>]
      [--note <text>]
      given and received may move a debt in another currency than the account's: --debt-amount
      is what they changed in it, in that currency
      forgave and forgiven settle a debt without money moving: the amount counts as spending
      from the account, or income to it, in a built-in category
  transactions update <transaction> [same options as add]     What isn't given keeps its value
  transactions delete <transaction> | transactions restore <transaction>

Options:
  --env <file>   Instance settings (default: .env.instance); the session is kept in <file>.session
`;

const commands: Commands = {
  ...sessionCommands,
  ...spaceCommands,
  ...accountCommands,
  ...categoryCommands,
  ...counterpartyCommands,
  ...transactionCommands,
};

await main();

async function main() {
  const argv = process.argv.slice(2);
  const [first = "", second = ""] = argv;
  if (first === "--help" || first === "-h" || first === "") {
    console.log(usage);
    process.exit(first === "" ? 1 : 0);
  }
  const pair = `${first} ${second}`;
  const [name, rest] = Object.hasOwn(commands, pair)
    ? [pair, argv.slice(2)]
    : [first, argv.slice(1)];
  const command = commands[name];
  if (!command) {
    const typed = [first, second].filter((word) => word !== "" && !word.startsWith("-"));
    fail(`No command "${typed.join(" ")}". See pnpm app --help.`);
  }

  try {
    await command(rest);
  } catch (error) {
    fail(messageOf(error));
  }
}
