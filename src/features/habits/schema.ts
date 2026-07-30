import { z } from "zod";

export const habitFormSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre para el hábito.").max(80, "Usa 80 caracteres o menos."),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type HabitFormValues = z.infer<typeof habitFormSchema>;
