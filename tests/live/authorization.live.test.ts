import { afterAll, describe, expect, it } from "vitest";

import { createSupabaseBrowserClient, type PactoSupabaseClient } from "../../src/infrastructure/supabase/client";
import {
  asLifecycleClient,
  createSupabaseLifecycleRepositories,
  type LifecycleClient,
} from "../../src/infrastructure/supabase/repositories/lifecycle";
import {
  asPrivateDataClient,
  createSupabasePrivateRepositories,
  type PrivateDataClient,
} from "../../src/infrastructure/supabase/repositories/private";

declare const process: { env: Record<string, string | undefined> };

type ActorName = "userA" | "userB" | "intruder";
type Actor = {
  client: PactoSupabaseClient;
  raw: LifecycleClient & PrivateDataClient;
  email: string;
  userId: string;
};
type RawResult = { data: unknown; error: { message?: string } | null };
type RawQuery = PromiseLike<RawResult> & {
  select(columns: string): RawQuery;
  insert(values: unknown): RawQuery;
  update(values: unknown): RawQuery;
  delete(): RawQuery;
  eq(column: string, value: unknown): RawQuery;
  maybeSingle(): Promise<RawResult>;
};

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Live prerequisite ${name} is missing; the wrapper must report this run as blocked.`);
  return value;
};

const config = {
  url: required("SUPABASE_TEST_URL"),
  publishableKey: required("SUPABASE_TEST_PUBLISHABLE_KEY"),
};
const credentials: Record<ActorName, { email: string; password: string }> = {
  userA: { email: required("SUPABASE_TEST_USER_A_EMAIL"), password: required("SUPABASE_TEST_USER_A_PASSWORD") },
  userB: { email: required("SUPABASE_TEST_USER_B_EMAIL"), password: required("SUPABASE_TEST_USER_B_PASSWORD") },
  intruder: { email: required("SUPABASE_TEST_INTRUDER_EMAIL"), password: required("SUPABASE_TEST_INTRUDER_PASSWORD") },
};
const actors = {} as Record<ActorName, Actor>;
const cleanup: { habitId?: string; noteId?: string } = {};

function rawFrom(actor: Actor, table: string): RawQuery {
  return actor.raw.from(table) as unknown as RawQuery;
}

async function signIn(name: ActorName): Promise<Actor> {
  const client = createSupabaseBrowserClient(config);
  const { email, password } = credentials[name];
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`${name} sign-in failed: ${error?.message ?? "session unavailable"}`);
  return { client, raw: Object.assign(asPrivateDataClient(client), asLifecycleClient(client)), email, userId: data.user.id };
}

async function expectHidden(actor: Actor, table: string, id: string): Promise<void> {
  const result = await rawFrom(actor, table).select("id").eq("id", id).maybeSingle();
  expect(result.error).toBeNull();
  expect(result.data).toBeNull();
}

async function expectRejected(action: () => Promise<unknown>): Promise<void> {
  await expect(action()).rejects.toThrow();
}

afterAll(async () => {
  const owner = actors.userA;
  if (owner && cleanup.noteId) await rawFrom(owner, "private_notes").delete().eq("id", cleanup.noteId);
  if (owner && cleanup.habitId) await rawFrom(owner, "goals").delete().eq("id", cleanup.habitId);
  await Promise.all(Object.values(actors).map((actor) => actor.client.auth.signOut({ scope: "local" })));
});

describe.sequential("credential-gated hosted authorization and adapter paths", () => {
  async function ensureActivePartnership(): Promise<ReturnType<typeof createSupabaseLifecycleRepositories>> {
    const a = createSupabaseLifecycleRepositories(actors.userA.raw);
    const b = createSupabaseLifecycleRepositories(actors.userB.raw);
    const current = await a.partnership.getMine();
    if (current?.status === "active") return { partnership: a.partnership, support: a.support };
    if (current?.status === "paused") await a.partnership.end();
    const invite = await a.partnership.createInvite(actors.userB.email);
    await b.partnership.acceptInvite(invite.code);
    return { partnership: a.partnership, support: a.support };
  }

  it("authenticates three distinct disposable actors with public credentials", async () => {
    actors.userA = await signIn("userA");
    actors.userB = await signIn("userB");
    actors.intruder = await signIn("intruder");
    expect(new Set(Object.values(actors).map((actor) => actor.userId)).size).toBe(3);
  });

  it("keeps adapter owner data and direct private notes isolated", async () => {
    const ownerRepositories = createSupabasePrivateRepositories(actors.userA.raw);
    const habit = await ownerRepositories.habits.create({ name: `Live RLS ${Date.now()}`, priority: 2 });
    cleanup.habitId = habit.id;
    expect(habit.ownerId).toBe(actors.userA.userId);
    expect((await ownerRepositories.habits.listMine()).some((row) => row.id === habit.id)).toBe(true);

    for (const actor of [actors.userB, actors.intruder]) {
      expect((await createSupabasePrivateRepositories(actor.raw).habits.listMine()).some((row) => row.id === habit.id)).toBe(false);
      await expectHidden(actor, "goals", habit.id);
      const forged = await rawFrom(actor, "goals").update({ name: "forged" }).eq("id", habit.id).select("id");
      expect(forged.error).toBeNull();
      expect(forged.data).toEqual([]);
    }
    expect((await ownerRepositories.habits.listMine()).find((row) => row.id === habit.id)?.name).toBe(habit.name);

    const note = await rawFrom(actors.userA, "private_notes")
      .insert({ user_id: actors.userA.userId, body: `private-${Date.now()}` })
      .select("id,user_id,body")
      .maybeSingle();
    expect(note.error).toBeNull();
    cleanup.noteId = (note.data as { id: string }).id;
    for (const actor of [actors.userB, actors.intruder]) await expectHidden(actor, "private_notes", cleanup.noteId);
  });

  it("uses adapter RPCs for active partnership and support authorization", async () => {
    const a = await ensureActivePartnership();
    const b = createSupabaseLifecycleRepositories(actors.userB.raw);
    const intruder = createSupabaseLifecycleRepositories(actors.intruder.raw);

    expect((await a.partnership.getMine())?.partner.userId).toBe(actors.userB.userId);
    expect((await b.partnership.getMine())?.partner.userId).toBe(actors.userA.userId);
    expect(await intruder.partnership.getMine()).toBeNull();

    const request = await a.support.create({ type: "conversation" });
    expect((await b.support.list()).some((row) => row.id === request.id)).toBe(true);
    expect(await intruder.support.list()).toEqual([]);
    expect((await b.support.acknowledge(request.id, "available_now")).status).toBe("acknowledged");
    expect((await b.support.close(request.id)).status).toBe("closed");

    const directMutation = await rawFrom(actors.userB, "partnerships")
      .update({ status: "ended" })
      .eq("id", (await b.partnership.getMine())!.id)
      .select("id");
    expect(directMutation.error).not.toBeNull();
  });

  it("revokes partnership/support access immediately on pause and permanently on end", async () => {
    const a = await ensureActivePartnership();
    const b = createSupabaseLifecycleRepositories(actors.userB.raw);
    const pendingAtRevocation = await a.support.create({ type: "motivation" });

    expect((await a.partnership.pause()).status).toBe("paused");
    expect(await a.support.list()).toEqual([]);
    expect(await b.support.list()).toEqual([]);
    await expectRejected(() => b.support.create({ type: "food_choice" }));
    await expectHidden(actors.userB, "support_requests", pendingAtRevocation.id);
    expect((await b.partnership.getMine())?.partner.userId).toBe("");

    expect((await b.partnership.end()).status).toBe("ended");
    expect(await a.support.list()).toEqual([]);
    expect(await b.support.list()).toEqual([]);
    await expectRejected(() => a.support.create({ type: "conversation" }));
    await expectRejected(() => a.partnership.pause());
    expect((await a.partnership.getMine())?.partner.userId).toBe("");
  });
});
