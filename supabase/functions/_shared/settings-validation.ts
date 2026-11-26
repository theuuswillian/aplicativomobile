export type SettingsPatch = {
  theme?: "dark" | "light" | "system";
  accent?: string | null;
  whatsapp_weekly_summary?: boolean;
  push_enabled?: boolean;
  quiet_notifications?: boolean;
};

export type SettingsValidation =
  | { ok: true; value: SettingsPatch }
  | { ok: false };

export function validateSettingsPatch(input: unknown): SettingsValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false };
  const record = input as Record<string, unknown>;
  const allowed = new Set([
    "theme",
    "accent",
    "whatsapp_weekly_summary",
    "push_enabled",
    "quiet_notifications",
  ]);
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) return { ok: false };

  const patch: SettingsPatch = {};
  for (const key of keys) {
    const value = record[key];
    if (key === "theme") {
      if (value !== "dark" && value !== "light" && value !== "system") return { ok: false };
      patch.theme = value;
    } else if (key === "accent") {
      if (value !== null && (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value))) {
        return { ok: false };
      }
      patch.accent = value;
    } else {
      if (typeof value !== "boolean") return { ok: false };
      if (key === "whatsapp_weekly_summary") patch.whatsapp_weekly_summary = value;
      if (key === "push_enabled") patch.push_enabled = value;
      if (key === "quiet_notifications") patch.quiet_notifications = value;
    }
  }
  return { ok: true, value: patch };
}
