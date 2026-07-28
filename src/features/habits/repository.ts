import type { CreateHabitInput, Habit } from "./model";

export interface HabitRepository {
  create(input: CreateHabitInput): Promise<Habit>;
  listMine(): Promise<Habit[]>;
  update(id: string, input: Partial<CreateHabitInput>): Promise<Habit>;
  remove(id: string): Promise<void>;
}
