import type { SupportRequestView, SupportType } from "./model";

export interface SupportRepository {
  list(): Promise<SupportRequestView[]>;
  create(type: SupportType): Promise<SupportRequestView>;
  acknowledge(id: string): Promise<SupportRequestView>;
  close(id: string): Promise<SupportRequestView>;
}
