import { createHabitInputSchema, type Habit } from "../../features/habits/model";
import type { HabitRepository } from "../../features/habits/repository";
import type { AuthCredentials, Session } from "../../features/auth/model";
import type { AuthPort } from "../../features/auth/port";
import type { ProgressRepository } from "../../features/progress/repository";
import type { PartnershipRepository } from "../../features/partnership/repository";
import type { PreferenceRepository } from "../../features/preferences/repository";
import type { SupportRepository } from "../../features/support/repository";
import { saveDailyCheckinInputSchema, type SavedCheckin } from "../../features/checkin/model";
import type { DailyCheckinRepository } from "../../features/checkin/repository";
import { localDayAt, resolveTimezone } from "../../features/checkin/timezone";
import { createPartnershipFixture } from "./partnership";
import { saveRecoveryInputSchema, type RecoveryRecord } from "../../features/recovery/model";
import type { RecoveryRepository } from "../../features/recovery/repository";

type Account = { id: string; email: string; password: string; displayName: string };
type PartnershipFixture = ReturnType<typeof createPartnershipFixture>;
export type FixtureStore = { accounts: Account[]; habits: Habit[]; checkins: Map<string, SavedCheckin>; recoveries: Map<string, RecoveryRecord[]>; partnershipFixture?: PartnershipFixture };

export function createFixtureStore(): FixtureStore {
  return { accounts: [], habits: [], checkins: new Map(), recoveries: new Map() };
}

export function createFixtureServices(store = createFixtureStore(), now: () => Date = () => new Date()) {
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

  const checkin: DailyCheckinRepository = {
    async loadToday(input = {}) {
      const ownerId = requireOwner();
      const timezone = resolveTimezone({
        browserTimezone: input.browserTimezone,
        browserTimezoneConfirmed: input.browserTimezoneConfirmed,
      });
      const entryDate = localDayAt(now(), timezone.timezone);
      const saved = store.checkins.get(`${ownerId}:${entryDate}`) ?? null;
      const answers = new Map(saved?.habits.map((answer) => [answer.goalId, answer]));
      return {
        entryDate,
        timezone: timezone.timezone,
        timezoneSource: timezone.source,
        requiresBrowserConfirmation: timezone.requiresBrowserConfirmation,
        goals: store.habits
          .filter((habit) => habit.ownerId === ownerId && habit.active)
          .map(({ id, name, priority }) => ({ id, name, priority, answer: answers.get(id) ?? null })),
        saved: saved ? structuredClone(saved) : null,
      };
    },
    async save(input) {
      const ownerId = requireOwner();
      const safe = saveDailyCheckinInputSchema.parse(input);
      const activeIds = store.habits.filter((habit) => habit.ownerId === ownerId && habit.active).map(({ id }) => id).sort();
      const submittedIds = safe.habits.map(({ goalId }) => goalId).sort();
      if (activeIds.length !== submittedIds.length || activeIds.some((id, index) => id !== submittedIds[index])) {
        throw new Error("Every active goal requires an answer.");
      }
      const entryDate = localDayAt(now(), safe.timezone);
      const key = `${ownerId}:${entryDate}`;
      const existing = store.checkins.get(key);
      const saved: SavedCheckin = {
        id: existing?.id ?? crypto.randomUUID(),
        entryDate,
        cravingLevel: safe.cravingLevel,
        completedAt: now().toISOString(),
        habits: structuredClone(safe.habits),
      };
      store.checkins.set(key, saved);
      return structuredClone(saved);
    },
  };

  const recovery: RecoveryRepository = {
    async timeline() { return structuredClone(store.recoveries.get(requireOwner()) ?? []); },
    async save(input) {
      const ownerId = requireOwner();
      const safe = saveRecoveryInputSchema.parse(input);
      const records = store.recoveries.get(ownerId) ?? [];
      const prior = records.find((record) => record.id === safe.operationId);
      if (prior) return structuredClone(prior);
      if (safe.expectedRevision !== (records[0]?.revision ?? 0)) throw new Error("Recovery revision conflict.");
      const record: RecoveryRecord = {
        id: safe.operationId,
        revision: safe.expectedRevision + 1,
        trigger: safe.trigger,
        moment: safe.moment,
        need: safe.need,
        alternative: safe.alternative,
        privateNote: safe.privateNote?.trim() || null,
        recordedAt: now().toISOString(),
      };
      store.recoveries.set(ownerId, [record, ...records]);
      return structuredClone(record);
    },
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
    async requestResume() { return consentServices().partnership.requestResume(); },
    async confirmResume() { return consentServices().partnership.confirmResume(); },
    async end() { return consentServices().partnership.end(); },
  };
  const preferences: PreferenceRepository = {
    async getMine() { return consentServices().preferences.getMine(); },
    async updateMine(input) { return consentServices().preferences.updateMine(input); },
    async completeSetup(input) {
      const { goal, ...preferencesInput } = input;
      const result = await consentServices().preferences.updateMine(preferencesInput);
      await habits.create({ name: goal, priority: 1 });
      return result;
    },
  };
  const support: SupportRepository = {
    async list() { return consentServices().support.list(); },
    async create(input) { return consentServices().support.create(input); },
    async acknowledge(id, response) { return consentServices().support.acknowledge(id, response); },
    async close(id) { return consentServices().support.close(id); },
  };

  return { auth, habits, progress, partnership, preferences, support, checkin, recovery };
}
