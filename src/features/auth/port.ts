import type { AuthCredentials, Session } from "./model";

export interface AuthPort {
  getSession(): Promise<Session | null>;
  register(credentials: AuthCredentials): Promise<Session>;
  login(credentials: AuthCredentials): Promise<Session>;
  logout(): Promise<void>;
}
