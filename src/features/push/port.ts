export type PushStatus = "unsupported" | "default" | "denied" | "enabled" | "unavailable";

export interface PushSubscriptionPort {
  status(): Promise<PushStatus>;
  activate(): Promise<PushStatus>;
  revoke(): Promise<PushStatus>;
}

export function createUnavailablePushPort(): PushSubscriptionPort {
  return {
    status: async () => "unavailable",
    activate: async () => "unavailable",
    revoke: async () => "unavailable",
  };
}
