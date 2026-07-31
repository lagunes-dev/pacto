import type { CreateSupportRequest, SupportRequestView, SupportResponse } from "./model";

export interface SupportRepository {
  list(): Promise<SupportRequestView[]>;
  create(input: CreateSupportRequest): Promise<SupportRequestView>;
  acknowledge(id: string, response: SupportResponse): Promise<SupportRequestView>;
  close(id: string): Promise<SupportRequestView>;
}
