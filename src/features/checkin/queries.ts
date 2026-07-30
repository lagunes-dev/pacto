export const dailyCheckinKeys = {
  today: (ownerId: string) => ["daily-checkin", ownerId, "today"] as const,
};
