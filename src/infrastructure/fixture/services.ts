import { createHabitInputSchema, type Habit } from "../../features/habits/model";
import type { HabitRepository } from "../../features/habits/repository";
import type { AuthCredentials, Session } from "../../features/auth/model";
import type { AuthPort } from "../../features/auth/port";
import type { ProgressRepository } from "../../features/progress/repository";

type Account = { id: string; email: string; password: string };
export type FixtureStore = { accounts: Account[]; habits: Habit[] };

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
      const account = { id: crypto.randomUUID(), email, password: credentials.password };
      store.accounts.push(account);
      return (session = { user: { id: account.id, email } });
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

  return { auth, habits, progress };
}
