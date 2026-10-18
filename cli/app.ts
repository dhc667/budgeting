import { fail, messageOf } from "./fail.ts";
import { accountCommands } from "./app/accounts.ts";
import { categoryCommands } from "./app/categories.ts";
import type { Commands } from "./app/command.ts";
import { sessionCommands } from "./app/session.ts";
import { spaceCommands } from "./app/spaces.ts";
import { transactionCommands } from "./app/transactions.ts";

const usage = `Usage: pnpm app <command> [options] [--env <file>]

Uses the app as the signed-in user: the same rules apply as on their phone, and what they can't
see or change, neither can these commands. Reads and writes print JSON. Amounts are whole numbers
in the currency's minor units (1250 is 12.50 USD). Dates are like 2026-10-18 and default to today.

Session:
  login [--email <email>] [--password-stdin]   Sign in; asks for the password unless piped in
  logout                                       End this session (other devices stay signed in)
  whoami                                       Who is signed in, and where

Spaces:
  spaces list
  spaces add --name <name>                     Just you in it; add members from the app

Accounts (--space defaults to your private space):
  accounts list [--space <id>] [--archived]
  accounts add --name <name> --currency <code> [--space <id>] [--color <color>]
      [--opening-amount <n>] [--opening-date <date>]
  accounts update <id> [--name ...] [--currency ...] [--color ...] [--opening-amount ...]
      [--opening-date ...]
  accounts archive <id> | accounts unarchive <id>
  accounts delete <id>

Categories (--space defaults to your private space):
  categories list [--space <id>] [--kind expense|income]
  categories add --name <name> --kind expense|income [--space <id>] [--icon <lucide name>]
      [--color <color>] [--parent <id>]
  categories update <id> [--name ...] [--kind ...] [--icon ...] [--color ...]
      [--parent <id> | --no-parent]
  categories delete <id> [--move-to <id>]      Its transactions move to --move-to

Transactions:
  transactions list [--space <id>] [--account <id>] [--category <id>] [--from <date>]
      [--to <date>] [--search <text>] [--limit <n>]
  transactions show <id>
  transactions add --type expense|refund|income|transfer --account <id> --amount <n>
      [--category <id>] [--to-account <id>] [--to-amount <n>] [--date <date>]
      [--title <text>] [--note <text>]
  transactions update <id> [same options as add]     What isn't given keeps its value
  transactions delete <id> | transactions restore <id>

Options:
  --env <file>   Instance settings (default: .env.instance); the session is kept in <file>.session
`;

const commands: Commands = {
  ...sessionCommands,
  ...spaceCommands,
  ...accountCommands,
  ...categoryCommands,
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
