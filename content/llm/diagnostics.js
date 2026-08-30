import { PROVIDERS } from "./providers.js";

const MAX_DIAGNOSTIC_ATTEMPTS = 8;

function safeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function safeText(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text ? text : fallback;
}

export function providerLabel(provider) {
  const id = safeText(provider, "unknown");
  return PROVIDERS[id]?.label ?? id;
}

/**
 * 只保留可安全交給 console／Discord 的 attempt 欄位；絕不帶出 API key、URL 或原文 body。
 */
export function normalizeLlmAttempts(attempts) {
  if (!Array.isArray(attempts)) return [];
  return attempts.slice(0, MAX_DIAGNOSTIC_ATTEMPTS).map((attempt) => ({
    provider: safeText(attempt?.provider, "unknown"),
    providerLabel: providerLabel(attempt?.provider),
    model: safeText(attempt?.model),
    stage: safeText(attempt?.stage, "unknown"),
    httpStatus: safeStatus(attempt?.httpStatus ?? attempt?.status),
  }));
}

function attemptText(attempt) {
  const provider = attempt.providerLabel || attempt.provider;
  const model = attempt.model ? `/${attempt.model}` : "";
  const reason = attempt.httpStatus ? ` HTTP ${attempt.httpStatus}` : ` ${attempt.stage}`;
  return `${provider}${model}${reason}`;
}

export function formatLlmAttempts(attempts) {
  const normalized = normalizeLlmAttempts(attempts);
  return normalized.length ? normalized.map(attemptText).join(" → ") : "無 provider attempt 資料";
}

/**
 * 建立跨 console、API 與 Discord 共用的安全診斷物件。
 * outcome 可用 recovered／failed；成功但沒有 fallback 時不需要保存診斷。
 */
export function buildLlmDiagnostic({
  attempts,
  provider,
  model,
  stage = "unknown",
  status = null,
  autoRetryAttempts = 0,
  outcome = "failed",
  recordedAt = new Date().toISOString(),
} = {}) {
  const normalized = normalizeLlmAttempts(attempts);
  const finalProvider = safeText(provider, normalized.at(-1)?.provider ?? null);
  const finalModel = safeText(model, normalized.at(-1)?.model ?? null);
  const finalStatus = safeStatus(status);
  const withCurrentFailure = normalized.length
    ? normalized
    : finalProvider
      ? [{
          provider: finalProvider,
          providerLabel: providerLabel(finalProvider),
          model: finalModel,
          stage: safeText(stage, "unknown"),
          httpStatus: finalStatus,
        }]
      : [];
  const lastAttempt = withCurrentFailure.at(-1);
  const attemptsWithSuccess = outcome === "recovered" && finalProvider
    && !(lastAttempt?.provider === finalProvider && lastAttempt?.stage === "success")
    ? [...withCurrentFailure, {
        provider: finalProvider,
        providerLabel: providerLabel(finalProvider),
        model: finalModel,
        stage: "success",
        httpStatus: null,
      }]
    : withCurrentFailure;
  const retryCount = Number(autoRetryAttempts);

  return {
    outcome: outcome === "recovered" ? "recovered" : "failed",
    finalProvider,
    finalProviderLabel: finalProvider ? providerLabel(finalProvider) : null,
    finalModel,
    attempts: attemptsWithSuccess,
    autoRetryAttempts: Number.isFinite(retryCount) && retryCount >= 0 ? Math.trunc(retryCount) : 0,
    summary: formatLlmAttempts(attemptsWithSuccess),
    recordedAt: safeText(recordedAt, new Date().toISOString()),
  };
}
