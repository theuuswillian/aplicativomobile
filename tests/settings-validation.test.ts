import { describe, expect, it } from "vitest";
import { validateSettingsPatch } from "../supabase/functions/_shared/settings-validation";

describe("validateSettingsPatch", () => {
  it("accepts a partial theme and notification preference update", () => {
    expect(validateSettingsPatch({
      theme: "light",
      push_enabled: true,
      quiet_notifications: false,
    })).toEqual({
      ok: true,
      value: {
        theme: "light",
        push_enabled: true,
        quiet_notifications: false,
      },
    });
  });

  it("accepts null accent to clear the selected accent", () => {
    expect(validateSettingsPatch({ accent: null })).toEqual({
      ok: true,
      value: { accent: null },
    });
  });

  it("rejects empty, unknown and server-controlled fields", () => {
    expect(validateSettingsPatch({})).toEqual({ ok: false });
    expect(validateSettingsPatch({ user_id: "other-user" })).toEqual({ ok: false });
    expect(validateSettingsPatch({ role: "service_role" })).toEqual({ ok: false });
  });

  it("rejects invalid themes, colors and boolean types", () => {
    expect(validateSettingsPatch({ theme: "auto" })).toEqual({ ok: false });
    expect(validateSettingsPatch({ accent: "red" })).toEqual({ ok: false });
    expect(validateSettingsPatch({ push_enabled: "true" })).toEqual({ ok: false });
  });
});
