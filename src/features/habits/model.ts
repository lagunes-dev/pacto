import { z } from "zod";

export const createHabitInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
}).strict();

export type CreateHabitInput = z.infer<typeof createHabitInputSchema>;
export type Habit = CreateHabitInput & {
  id: string;
  ownerId: string;
  active: boolean;
  createdAt: string;
};
