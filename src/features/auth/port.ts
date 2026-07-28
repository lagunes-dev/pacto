import type { AuthCredentials, RegistrationResult, Session } from "./model";

export interface AuthPort {
  getSession(): Promise<Session | null>;
  register(credentials: AuthCredentials): Promise<RegistrationResult>;
  login(credentials: AuthCredentials): Promise<Session>;
  logout(): Promise<void>;
}
