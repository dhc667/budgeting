import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  admin,
  createSpace,
  privateSpaceOf,
  signedInUser,
  sql,
  type SignedInUser as User,
} from "../support/local-instance.ts";

afterAll(() => sql.end());

describe("the private space", () => {
  let ana: User;

  beforeEach(async () => {
    ana = await signedInUser("Ana");
  });

  it("is created at signup, with its owner as the only member", async () => {
    const space = await privateSpaceOf(ana);

    const { data: members } = await ana.client
      .from("space_members")
      .select("user_id")
      .eq("space_id", space.id);
    expect(space.name).toBeNull();
    expect(members).toEqual([{ user_id: ana.userId }]);
  });

  it("can't be shared, renamed or deleted", async () => {
    const ben = await signedInUser("Ben");
    const space = await privateSpaceOf(ana);

    const added = await ana.client
      .from("space_members")
      .insert({ space_id: space.id, user_id: ben.userId });
    await ana.client.from("spaces").update({ name: "Mine" }).eq("id", space.id);
    await ana.client.from("spaces").delete().eq("id", space.id);

    expect(added.error).not.toBeNull();
    expect(await privateSpaceOf(ana)).toEqual(space);
  });

  it("can't be left", async () => {
    const space = await privateSpaceOf(ana);

    const { error } = await ana.client
      .from("space_members")
      .delete()
      .eq("space_id", space.id)
      .eq("user_id", ana.userId);

    expect(error?.message).toMatch(/private space always keeps its owner/);
  });

  it("is invisible to everyone else", async () => {
    const ben = await signedInUser("Ben");
    const space = await privateSpaceOf(ana);

    const { data } = await ben.client.from("spaces").select("id").eq("id", space.id);

    expect(data).toEqual([]);
  });
});

describe("a shared space", () => {
  let ana: User;
  let ben: User;
  let carla: User;

  beforeEach(async () => {
    [ana, ben, carla] = await Promise.all([
      signedInUser("Ana"),
      signedInUser("Ben"),
      signedInUser("Carla"),
    ]);
  });

  it("is created with the members chosen, who see it at once", async () => {
    const spaceId = await createSpace(ana, "Family", [ben]);

    const { data } = await ben.client.from("spaces").select("name").eq("id", spaceId);

    expect(data).toEqual([{ name: "Family" }]);
    expect(await membersOf(ben, spaceId)).toEqual(sorted([ana.userId, ben.userId]));
  });

  it("is hidden from non-members, with its members and activity", async () => {
    const spaceId = await createSpace(ana, "Family", [ben]);

    const spaces = await carla.client.from("spaces").select("id").eq("id", spaceId);
    const members = await carla.client.from("space_members").select("id").eq("space_id", spaceId);
    const activity = await carla.client.from("activity").select("id").eq("space_id", spaceId);

    expect([spaces.data, members.data, activity.data]).toEqual([[], [], []]);
  });

  it("refuses a blank name", async () => {
    const { error } = await ana.client.rpc("create_space", {
      space_name: "  ",
      member_ids: [],
      starter_language: "en",
    });

    expect(error).not.toBeNull();
  });

  it("can be renamed by any member, but not by anyone else", async () => {
    const spaceId = await createSpace(ana, "Family", [ben]);

    await carla.client.from("spaces").update({ name: "Hijacked" }).eq("id", spaceId);
    await ben.client.from("spaces").update({ name: "Home" }).eq("id", spaceId);

    const { data } = await ana.client.from("spaces").select("name").eq("id", spaceId);
    expect(data).toEqual([{ name: "Home" }]);
  });

  it("lets any member add any user, who is a member at once", async () => {
    const spaceId = await createSpace(ana, "Family", [ben]);

    const { error } = await ben.client
      .from("space_members")
      .insert({ space_id: spaceId, user_id: carla.userId });

    expect(error).toBeNull();
    expect(await membersOf(carla, spaceId)).toEqual(sorted([ana.userId, ben.userId, carla.userId]));
  });

  it("doesn't let a non-member join on their own", async () => {
    const spaceId = await createSpace(ana, "Family", []);

    const { error } = await carla.client
      .from("space_members")
      .insert({ space_id: spaceId, user_id: carla.userId });

    expect(error).not.toBeNull();
    expect(await membersOf(ana, spaceId)).toEqual([ana.userId]);
  });

  it("lets a member remove another member, or leave", async () => {
    const spaceId = await createSpace(ana, "Family", [ben, carla]);

    await ana.client
      .from("space_members")
      .delete()
      .match({ space_id: spaceId, user_id: ben.userId });
    await carla.client
      .from("space_members")
      .delete()
      .match({ space_id: spaceId, user_id: carla.userId });

    expect(await membersOf(ana, spaceId)).toEqual([ana.userId]);
    const { data } = await carla.client.from("spaces").select("id").eq("id", spaceId);
    expect(data).toEqual([]);
  });

  it("doesn't let its last member leave", async () => {
    const spaceId = await createSpace(ana, "Family", []);

    const { error } = await ana.client
      .from("space_members")
      .delete()
      .match({ space_id: spaceId, user_id: ana.userId });

    expect(error?.message).toMatch(/last member/);
    expect(await membersOf(ana, spaceId)).toEqual([ana.userId]);
  });

  it("can be deleted by a member, activity and all", async () => {
    const spaceId = await createSpace(ana, "Family", [ben]);

    await carla.client.from("spaces").delete().eq("id", spaceId);
    const stillThere = await ben.client.from("spaces").select("id").eq("id", spaceId);
    const { error } = await ben.client.from("spaces").delete().eq("id", spaceId);

    expect(stillThere.data).toHaveLength(1);
    expect(error).toBeNull();
    const [left] = await sql`
      select
        (select count(*)::int from spaces where id = ${spaceId}) as spaces,
        (select count(*)::int from activity where space_id = ${spaceId}) as activity`;
    expect(left).toEqual({ spaces: 0, activity: 0 });
  });
});

describe("the activity record", () => {
  it("logs who changed a shared space, when, and what it was before", async () => {
    const [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
    const spaceId = await createSpace(ana, "Family", []);

    await ana.client.from("spaces").update({ name: "Home" }).eq("id", spaceId);
    await ana.client.from("space_members").insert({ space_id: spaceId, user_id: ben.userId });

    const { data } = await ben.client
      .from("activity")
      .select("table_name, action, changed_by, old, new")
      .eq("space_id", spaceId)
      .order("id");
    expect(data).toEqual([
      expect.objectContaining({ table_name: "spaces", action: "insert", old: null }),
      expect.objectContaining({ table_name: "space_members", action: "insert" }),
      {
        table_name: "spaces",
        action: "update",
        changed_by: ana.userId,
        old: expect.objectContaining({ name: "Family" }) as unknown,
        new: expect.objectContaining({ name: "Home" }) as unknown,
      },
      expect.objectContaining({
        table_name: "space_members",
        action: "insert",
        changed_by: ana.userId,
        new: expect.objectContaining({ user_id: ben.userId }) as unknown,
      }),
    ]);
  });

  it("can't be written by users", async () => {
    const ana = await signedInUser("Ana");
    const spaceId = await createSpace(ana, "Family", []);

    const { error } = await ana.client.from("activity").delete().eq("space_id", spaceId);

    expect(error).not.toBeNull();
  });
});

describe("deleting a user", () => {
  it("works for a user with no history, taking their private space with them", async () => {
    const ana = await signedInUser("Ana");
    const space = await privateSpaceOf(ana);

    const { error } = await admin.auth.admin.deleteUser(ana.userId);

    expect(error).toBeNull();
    const [left] = await sql`select count(*)::int as spaces from spaces where id = ${space.id}`;
    expect(left).toEqual({ spaces: 0 });
  });

  it("works for a user others added to a shared space", async () => {
    const [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
    const spaceId = await createSpace(ana, "Family", [ben]);

    const { error } = await admin.auth.admin.deleteUser(ben.userId);

    expect(error).toBeNull();
    expect(await membersOf(ana, spaceId)).toEqual([ana.userId]);
  });

  const history: [string, (ana: User, ben: User) => Promise<unknown>][] = [
    ["created a space", (ana) => createSpace(ana, "Family", [])],
    [
      "renamed a space",
      async (ana, ben) => {
        const spaceId = await createSpace(ben, "Family", [ana]);
        await ana.client.from("spaces").update({ name: "Home" }).eq("id", spaceId);
      },
    ],
    [
      "added a member",
      async (ana, ben) => {
        const carla = await signedInUser("Carla");
        const spaceId = await createSpace(ben, "Family", [ana]);
        await ana.client.from("space_members").insert({ space_id: spaceId, user_id: carla.userId });
      },
    ],
  ];

  it.each(history)("is refused for a user who %s", async (_, makeHistory) => {
    const [ana, ben] = await Promise.all([signedInUser("Ana"), signedInUser("Ben")]);
    await makeHistory(ana, ben);

    const { error } = await admin.auth.admin.deleteUser(ana.userId);

    expect(error).not.toBeNull();
    const { data } = await ben.client.from("profiles").select("id").eq("id", ana.userId);
    expect(data).toEqual([{ id: ana.userId }]);
  });
});

async function membersOf(viewer: User, spaceId: string): Promise<string[]> {
  const { data, error } = await viewer.client
    .from("space_members")
    .select("user_id")
    .eq("space_id", spaceId);
  if (error) throw error;
  return sorted(data.map(({ user_id }) => user_id));
}

function sorted(ids: string[]): string[] {
  return [...ids].sort();
}
