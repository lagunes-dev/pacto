import { z } from "zod";

export type User = { id: string; email: string | null };
export type Session = { user: User };
export type AuthCredentials = { email: string; password: string };
export type RegistrationResult =
  | { status: "authenticated"; session: Session }
  | { status: "confirmation-required"; email: string };

export const authCredentialsSchema = z.object({
  email: z.email("Ingresa un correo válido."),
  password: z.string().min(8, "Usá al menos 8 caracteres.").max(128),
});
