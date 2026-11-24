export const RADAR_ASSET_CLASSES = ["stock", "fii", "etf", "bdr", "crypto"] as const;
export const RADAR_CONDITIONS = ["above", "below", "daily_drop"] as const;

export type RadarAssetClass = typeof RADAR_ASSET_CLASSES[number];
export type RadarCondition = typeof RADAR_CONDITIONS[number];

export type RadarAlertInput = {
  asset_class: RadarAssetClass;
  symbol: string;
  provider_asset_id: string | null;
  condition_type: RadarCondition;
  threshold: number;
};

export type RadarAlertPatch = Partial<Pick<RadarAlertInput, "symbol" | "provider_asset_id" | "condition_type" | "threshold">>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validSymbol = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(value);

const validProviderAssetId = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && value.length > 0 && value.length <= 80 &&
    /^[A-Za-z0-9._:-]+$/.test(value));

const validCondition = (value: unknown): value is RadarCondition =>
  typeof value === "string" && (RADAR_CONDITIONS as readonly string[]).includes(value);

const validThreshold = (condition: RadarCondition, value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 &&
  value <= (condition === "daily_drop" ? 100 : 1_000_000_000);

export function validateRadarAlertInput(value: unknown):
  | { ok: true; value: RadarAlertInput }
  | { ok: false } {
  if (!isRecord(value)) return { ok: false };
  const allowed = ["asset_class", "symbol", "provider_asset_id", "condition_type", "threshold"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return { ok: false };
  if (typeof value.asset_class !== "string" ||
      !(RADAR_ASSET_CLASSES as readonly string[]).includes(value.asset_class) ||
      !validSymbol(value.symbol) || !validCondition(value.condition_type) ||
      !validThreshold(value.condition_type, value.threshold)) return { ok: false };
  const provider = value.provider_asset_id === undefined ? null : value.provider_asset_id;
  if (!validProviderAssetId(provider)) return { ok: false };
  return {
    ok: true,
    value: {
      asset_class: value.asset_class as RadarAssetClass,
      symbol: value.symbol,
      provider_asset_id: provider,
      condition_type: value.condition_type,
      threshold: value.threshold,
    },
  };
}

export function validateRadarAlertPatch(value: unknown):
  | { ok: true; value: RadarAlertPatch }
  | { ok: false } {
  if (!isRecord(value)) return { ok: false };
  const allowed = ["symbol", "provider_asset_id", "condition_type", "threshold"];
  if (Object.keys(value).length === 0 || Object.keys(value).some((key) => !allowed.includes(key))) {
    return { ok: false };
  }
  const result: RadarAlertPatch = {};
  if ("symbol" in value) {
    if (!validSymbol(value.symbol)) return { ok: false };
    result.symbol = value.symbol;
  }
  if ("provider_asset_id" in value) {
    if (!validProviderAssetId(value.provider_asset_id)) return { ok: false };
    result.provider_asset_id = value.provider_asset_id;
  }
  if ("condition_type" in value) {
    if (!validCondition(value.condition_type)) return { ok: false };
    result.condition_type = value.condition_type;
  }
  if ("threshold" in value) {
    const condition = (result.condition_type ?? "above") as RadarCondition;
    if (!validThreshold(condition, value.threshold)) return { ok: false };
    result.threshold = value.threshold;
  }
  return { ok: true, value: result };
}

export function isRadarAlertId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
