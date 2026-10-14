import { describe, expect, it } from "vitest";
import { buildConnectLink, parseConnectParams } from "./connect-link";

const instance = {
  supabaseUrl: "https://abcd.supabase.co",
  publishableKey: "sb_publishable_xyz",
};

function paramsOf(link: string) {
  const hash = new URL(link).hash;
  return new URLSearchParams(hash.slice(hash.indexOf("?")));
}

describe("connect links", () => {
  it("round-trips an invite", () => {
    const link = buildConnectLink("https://me.github.io/budgeting/", {
      instance,
      inviteCode: "ABC123",
    });

    expect(link.startsWith("https://me.github.io/budgeting/#/connect?")).toBe(true);
    expect(parseConnectParams(paramsOf(link))).toEqual({ instance, inviteCode: "ABC123" });
  });

  it("leaves the code out when there is no invite", () => {
    const link = buildConnectLink("https://me.github.io/budgeting/", {
      instance,
      inviteCode: null,
    });

    expect(parseConnectParams(paramsOf(link))).toEqual({ instance, inviteCode: null });
  });

  it("rejects links missing the instance", () => {
    expect(parseConnectParams(new URLSearchParams("key=k"))).toBeNull();
    expect(parseConnectParams(new URLSearchParams("url=not-a-url&key=k"))).toBeNull();
  });

  it("only accepts an instance served over https, or over http from this machine", () => {
    const linkTo = (url: string) => parseConnectParams(new URLSearchParams({ url, key: "k" }));

    expect(linkTo("http://abcd.supabase.co")).toBeNull();
    expect(linkTo("ftp://abcd.supabase.co")).toBeNull();
    expect(linkTo("javascript:alert(1)")).toBeNull();
    expect(linkTo("http://127.0.0.1:54321")).not.toBeNull();
    expect(linkTo("http://localhost:54321")).not.toBeNull();
  });
});
