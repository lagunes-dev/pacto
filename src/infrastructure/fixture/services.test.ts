import { createHabitInputSchema } from "../../features/habits/model";
import { createFixtureServices, createFixtureStore } from "./services";

const ownerA = { email: "a@example.com", password: "private-a" };
const ownerB = { email: "b@example.com", password: "private-b" };

describe("development fixture privacy contracts", () => {
  it("resolves registration, logout, login, and session states", async () => {
    const services = createFixtureServices();
    const registered = await services.auth.register(ownerA);
    expect(await services.auth.getSession()).toEqual(registered);
    await services.auth.logout();
    expect(await services.auth.getSession()).toBeNull();
    expect(await services.auth.login(ownerA)).toEqual(registered);
    await expect(services.auth.login({ ...ownerA, password: "incorrect" })).rejects.toThrow("incorrectos");
  });

  it("isolates owner reads, updates, deletes, and progress", async () => {
    const store = createFixtureStore();
    const a = createFixtureServices(store);
    const b = createFixtureServices(store);
    await a.auth.register(ownerA);
    const habit = await a.habits.create({ name: "Walk", priority: 2 });
    await b.auth.register(ownerB);

    expect(await b.habits.listMine()).toEqual([]);
    expect(await b.progress.getMine()).toEqual({ habits: [], completedEntryCount: 0, activeDayCount: 0 });
    await expect(b.habits.update(habit.id, { name: "Stolen" })).rejects.toThrow("not found");
    await expect(b.habits.remove(habit.id)).rejects.toThrow("not found");
    expect((await a.habits.listMine())[0]?.name).toBe("Walk");
  });

  it("rejects form-supplied ownership and private-note fields", () => {
    expect(() => createHabitInputSchema.parse({ name: "Read", priority: 1, ownerId: "other", notes: "private" })).toThrow();
  });

  it("denies repository access without a session", async () => {
    const services = createFixtureServices();
    await expect(services.habits.listMine()).rejects.toThrow("Authentication required");
    await expect(services.progress.getMine()).rejects.toThrow("Authentication required");
    await expect(services.partnership.getMine()).rejects.toThrow("Authentication required");
  });

  it("wires identity-bound consent services and denies support immediately after pause", async () => {
    const store = createFixtureStore();
    const a = createFixtureServices(store);
    const b = createFixtureServices(store);
    const sessionA = await a.auth.register(ownerA);
    await b.auth.register(ownerB);

    const invite = await a.partnership.createInvite(ownerB.email);
    await b.partnership.acceptInvite(invite.code);
    const request = await a.support.create("check_in");

    expect(await b.support.list()).toEqual([{ ...request, requestedBy: "partner" }]);
    expect(JSON.stringify(await a.partnership.getMine())).not.toMatch(/notes|habits|summary|email/i);
    await b.partnership.pause();
    await expect(a.support.list()).rejects.toThrow("Active partnership required");
    expect(await a.preferences.getMine()).toMatchObject({ shareProgress: false, allowSupportRequests: true });
    expect(sessionA.user.id).not.toBe((await b.auth.getSession())?.user.id);
  });
});
