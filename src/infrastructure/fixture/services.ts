import { createHabitInputSchema, type Habit } from "../../features/habits/model";
import type { HabitRepository } from "../../features/habits/repository";
import type { AuthCredentials, Session } from "../../features/auth/model";
import type { AuthPort } from "../../features/auth/port";
import type { ProgressRepository } from "../../features/progress/repository";
import type { PartnershipRepository } from "../../features/partnership/repository";
import type { PreferenceRepository } from "../../features/preferences/repository";
import type { SupportRepository } from "../../features/support/repository";
import { createPartnershipFixture } from "./partnership";

type Account = { id: string; email: string; password: string; displayName: string };
type PartnershipFixture = ReturnType<typeof createPartnershipFixture>;
export type FixtureStore = { accounts: Account[]; habits: Habit[]; partnershipFixture?: PartnershipFixture };

export function createFixtureStore(): FixtureStore {
  return { accounts: [], habits: [] };
}

export function createFixtureServices(store = createFixtureStore()) {
  let session: Session | null = null;
  const requireOwner = () => {
    if (!session) throw new Error("Authentication required.");
    return session.user.id;
  };

  const auth: AuthPort = {
    async getSession() { return session; },
    async register(credentials: AuthCredentials) {
      const email = credentials.email.trim().toLowerCase();
      if (store.accounts.some((account) => account.email === email)) throw new Error("Ese correo ya está registrado.");
      const account = { id: crypto.randomUUID(), email, password: credentials.password, displayName: email.split("@")[0] };
      store.accounts.push(account);
      session = { user: { id: account.id, email } };
      return { status: "authenticated" as const, session };
    },
    async login(credentials: AuthCredentials) {
      const account = store.accounts.find((item) => item.email === credentials.email.trim().toLowerCase() && item.password === credentials.password);
      if (!account) throw new Error("Correo o contraseña incorrectos.");
      return (session = { user: { id: account.id, email: account.email } });
    },
    async logout() { session = null; },
  };

  const habits: HabitRepository = {
    async create(input) {
      const safeInput = createHabitInputSchema.parse(input);
      const habit: Habit = { ...safeInput, id: crypto.randomUUID(), ownerId: requireOwner(), active: true, createdAt: new Date().toISOString() };
      store.habits.push(habit);
      return { ...habit };
    },
    async listMine() { const ownerId = requireOwner(); return store.habits.filter((habit) => habit.ownerId === ownerId).map((habit) => ({ ...habit })); },
    async update(id, input) {
      const ownerId = requireOwner();
      const habit = store.habits.find((item) => item.id === id && item.ownerId === ownerId);
      if (!habit) throw new Error("Habit not found.");
      const next = createHabitInputSchema.parse({ name: input.name ?? habit.name, priority: input.priority ?? habit.priority });
      Object.assign(habit, next);
      return { ...habit };
    },
    async remove(id) {
      const ownerId = requireOwner();
      const index = store.habits.findIndex((item) => item.id === id && item.ownerId === ownerId);
      if (index < 0) throw new Error("Habit not found.");
      store.habits.splice(index, 1);
    },
  };

  const progress: ProgressRepository = {
    async getMine() { return { habits: await habits.listMine(), completedEntryCount: 0, activeDayCount: 0 }; },
  };

  const consentServices = () => {
    const ownerId = requireOwner();
    if (store.accounts.length < 2) throw new Error("Partnership fixture unavailable.");
    store.partnershipFixture ??= createPartnershipFixture({ users: [store.accounts[0], store.accounts[1]] });
    return store.partnershipFixture.forUser(ownerId);
  };
  const partnership: PartnershipRepository = {
    async getMine() { return consentServices().partnership.getMine(); },
    async createInvite(email) { return consentServices().partnership.createInvite(email); },
    async acceptInvite(code) { return consentServices().partnership.acceptInvite(code); },
    async rejectInvite(code) { return consentServices().partnership.rejectInvite(code); },
    async cancelInvite() { return consentServices().partnership.cancelInvite(); },
    async pause() { return consentServices().partnership.pause(); },
    async end() { return consentServices().partnership.end(); },
  };
  const preferences: PreferenceRepository = {
    async getMine() { return consentServices().preferences.getMine(); },
    async updateMine(input) { return consentServices().preferences.updateMine(input); },
  };
  const support: SupportRepository = {
    async list() { return consentServices().support.list(); },
    async create(type) { return consentServices().support.create(type); },
    async acknowledge(id) { return consentServices().support.acknowledge(id); },
    async close(id) { return consentServices().support.close(id); },
  };

  return { auth, habits, progress, partnership, preferences, support };
}
