// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionContext } from "../../src/auth/session";
import { InstanceContext } from "../../src/instance/instance-context";
import { LocalCopyProvider } from "../../src/sync/LocalCopyProvider";
import { copyQueryKey, useLocalCopy, useRequestPull } from "../../src/sync/local-copy-context";
import { today } from "../support/dates";
import {
  createSpace,
  defined,
  instance,
  signedInUser,
  sql,
  type SignedInUser as User,
  uniqueName,
} from "../support/local-instance";

afterAll(() => sql.end());
afterEach(cleanup);

let ana: User;
let ben: User;
let family: string;
let familyId: string;

beforeEach(async () => {
  [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
  family = uniqueName("Family");
  familyId = await createSpace(ana, family, [ben]);
});

describe("the local copy provider", () => {
  it("pulls when the app starts", async () => {
    await mount(ben);

    await screen.findByText(family);
  });

  it("pulls when asked, resolving once the pull is done", async () => {
    await mount(ben);
    await screen.findByText(family);
    await addAccount("Savings");

    await act(() => pullNow());

    expect(screen.getByText("Savings")).toBeTruthy();
  });

  it("pulls when the connection returns", async () => {
    await mount(ben);
    await screen.findByText(family);
    await addAccount("Savings");

    act(() => void window.dispatchEvent(new Event("online")));

    await screen.findByText("Savings");
  });

  it("pulls when the app comes back to the foreground", async () => {
    await mount(ben);
    await screen.findByText(family);
    await addAccount("Savings");

    act(() => void document.dispatchEvent(new Event("visibilitychange")));

    await screen.findByText("Savings");
  });

  it("refetches the user's queries whenever the copy changes", async () => {
    let fetches = 0;
    await mount(ben, () => {
      useQuery({
        queryKey: copyQueryKey("probe"),
        queryFn: () => ++fetches,
      });
    });
    await screen.findByText(family);
    await waitFor(() => expect(fetches).toBeGreaterThan(0));
    const before = fetches;

    await addAccount("Savings");
    await act(() => pullNow());

    await waitFor(() => expect(fetches).toBeGreaterThan(before));
  });
});

describe("what a change of the copy refetches", () => {
  it("leaves queries outside the copy alone", async () => {
    let fetches = 0;
    await mount(ben, () => {
      useQuery({ queryKey: ["elsewhere"], queryFn: () => ++fetches });
    });
    await screen.findByText(family);
    await waitFor(() => expect(fetches).toBe(1));

    await addAccount("Savings");
    await act(() => pullNow());
    await screen.findByText("Savings");

    expect(fetches).toBe(1);
  });
});

const asked = { pull: (): Promise<void> => Promise.resolve() };
const pullNow = () => asked.pull();

async function mount(user: User, useProbe: () => void = () => undefined) {
  const { data } = await user.client.auth.getSession();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <InstanceContext
        value={{
          instance,
          supabase: user.client,
          connect: () => undefined,
          disconnect: () => undefined,
        }}
      >
        <SessionContext value={defined(data.session)}>
          <LocalCopyProvider>
            <Probe useProbe={useProbe} />
          </LocalCopyProvider>
        </SessionContext>
      </InstanceContext>
    </QueryClientProvider>,
  );
}

function Probe({ useProbe }: { useProbe: () => void }) {
  const copy = useLocalCopy();
  const requestPull = useRequestPull();
  useEffect(() => {
    asked.pull = requestPull;
  }, [requestPull]);
  useProbe();
  const names = [
    ...(copy?.rows.spaces.values() ?? []),
    ...(copy?.rows.ledger_accounts.values() ?? []),
  ]
    .map((row): unknown => Reflect.get(row, "name"))
    .filter((name): name is string => typeof name === "string");
  return (
    <ul>
      {names.map((name, index) => (
        <li key={index}>{name}</li>
      ))}
    </ul>
  );
}

async function addAccount(name: string) {
  const { error } = await ana.client.rpc("create_account", {
    space: familyId,
    account_name: name,
    account_currency: "USD",
    account_color: "blue",
    opening_amount: 10_000,
    opening_date: today(),
  });
  if (error) throw error;
}
