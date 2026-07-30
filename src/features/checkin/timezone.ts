export const DEFAULT_TIMEZONE = "America/Mexico_City";

export type TimezoneResolution = {
  timezone: string;
  source: "profile" | "default" | "browser";
  requiresBrowserConfirmation: boolean;
};

export function isValidIanaTimezone(timezone: string | null | undefined): timezone is string {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function resolveTimezone(input: {
  profileTimezone?: string | null;
  browserTimezone?: string;
  browserTimezoneConfirmed?: boolean;
}): TimezoneResolution {
  if (isValidIanaTimezone(input.profileTimezone)) {
    return { timezone: input.profileTimezone, source: "profile", requiresBrowserConfirmation: false };
  }

  if (isValidIanaTimezone(input.browserTimezone)) {
    if (input.browserTimezoneConfirmed) {
      return { timezone: input.browserTimezone, source: "browser", requiresBrowserConfirmation: false };
    }
    return { timezone: DEFAULT_TIMEZONE, source: "default", requiresBrowserConfirmation: true };
  }

  return { timezone: DEFAULT_TIMEZONE, source: "default", requiresBrowserConfirmation: false };
}

export function localDayAt(instant: Date, timezone: string): string {
  if (!isValidIanaTimezone(timezone)) throw new RangeError(`Invalid IANA timezone: ${timezone}`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
