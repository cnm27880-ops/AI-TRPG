// 主神空間 Phase B0 的 server-owned 資料契約。
// 這裡只定義 schema、版本與公開 whitelist；不讀取 request、不呼叫 LLM，也不替玩家裁定規則。

export const GODSPACE_API_VERSION = "godspace.v1";
export const GODSPACE_SCHEMA_VERSION = 1;

/**
 * B0 目前只搭建契約與 gate。尚未實作的功能保持 false，避免前端把規劃誤當成可用功能。
 * 這份設定只能由 server code／未來 feature rollout 修改，不能接受玩家 payload 覆寫。
 */
export const GODSPACE_FEATURE_DEFAULTS = Object.freeze({
  phaseB: false,
  missionBoard: false,
  training: false,
  archive: false,
  cabinet: false,
});

const FEATURE_KEYS = Object.freeze(Object.keys(GODSPACE_FEATURE_DEFAULTS));

/** 建立新 session 的最小 godspace profile；時間由真正的 hub action 需要時寫入。 */
export function createGodspaceProfile() {
  return {
    schemaVersion: GODSPACE_SCHEMA_VERSION,
    firstArrivalAt: null,
    lastSeenAt: null,
    featureFlags: { ...GODSPACE_FEATURE_DEFAULTS },
  };
}

/**
 * 讀取舊存檔時只補缺少欄位，保留已由 server 保存的已知 flag；未知欄位不進公開 contract。
 * 這不是把前端輸入當真相，session profile 只能由 server storage 讀出後進入這裡。
 */
export function normalizeGodspaceProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const rawFlags = source.featureFlags && typeof source.featureFlags === "object"
    ? source.featureFlags
    : {};
  const featureFlags = { ...GODSPACE_FEATURE_DEFAULTS };
  for (const key of FEATURE_KEYS) {
    if (typeof rawFlags[key] === "boolean") featureFlags[key] = rawFlags[key];
  }

  return {
    schemaVersion: GODSPACE_SCHEMA_VERSION,
    firstArrivalAt: typeof source.firstArrivalAt === "string" ? source.firstArrivalAt : null,
    lastSeenAt: typeof source.lastSeenAt === "string" ? source.lastSeenAt : null,
    featureFlags,
  };
}

/** 只回傳 B0 明確允許前端知道的 profile 欄位。 */
export function publicGodspaceProfile(profile) {
  const normalized = normalizeGodspaceProfile(profile);
  return {
    schemaVersion: normalized.schemaVersion,
    firstArrivalAt: normalized.firstArrivalAt,
    lastSeenAt: normalized.lastSeenAt,
    featureFlags: { ...normalized.featureFlags },
  };
}

/**
 * B0 response 的固定欄位檢查。故意只做形狀驗證，不把它當成規則引擎或輸入驗證器。
 * 回傳 errors 而不是 throw，方便測試與未來 API health check 使用。
 */
export function validateGodspacePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") errors.push("payload 必須是物件");
  if (payload?.apiVersion !== GODSPACE_API_VERSION) errors.push("apiVersion 不符合 B0 contract");
  if (payload?.schemaVersion !== GODSPACE_SCHEMA_VERSION) errors.push("schemaVersion 不符合 B0 contract");
  if (!payload?.lifecycle || typeof payload.lifecycle.status !== "string") errors.push("缺少 lifecycle.status");
  if (!Array.isArray(payload?.actions)) errors.push("缺少 actions 陣列");
  if (!payload?.guide || typeof payload.guide !== "object") errors.push("缺少公開 godspace guide");
  if (typeof payload?.guide?.phase !== "string") errors.push("guide.phase 必須是 string");
  if (typeof payload?.guide?.title !== "string") errors.push("guide.title 必須是 string");
  if (!Array.isArray(payload?.guide?.steps)) errors.push("guide.steps 必須是陣列");
  if (!payload?.guide?.nextAction || typeof payload.guide.nextAction !== "object") errors.push("guide.nextAction 必須是物件");
  if (!payload?.profile || typeof payload.profile !== "object") errors.push("缺少公開 godspace profile");
  const flags = payload?.profile?.featureFlags;
  for (const key of FEATURE_KEYS) {
    if (typeof flags?.[key] !== "boolean") errors.push(`featureFlags.${key} 必須是 boolean`);
  }
  return { valid: errors.length === 0, errors };
}
