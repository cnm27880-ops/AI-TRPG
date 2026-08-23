# 《異形》V2 固定 LLM 冒煙測試報告

## 測試目的

本次測試使用隔離的固定 OpenAI 相容測試 LLM，實際呼叫 session 與 turn API，驗證 V2 副本從固定開場、玩家開場行動、骰子判定、reference effects、Ash 場景，到事件日誌與 session 持久化的完整接線。

本次**不是 Gemini 真實生成測試**。測試 LLM 只回傳預先寫好的合法 JSON；它的用途是排除 API 接線、事件裁定與狀態保存問題。

## 實際流程

| 回合 | 行動 | 結果 | 狀態 |
|---|---|---|---|
| 0 | V2 固定開場 | 不呼叫 LLM | `evt_cryo_clearance`，產生 `app_cryo_recon` 等 reference options |
| 1 | `app_cryo_recon`：撿起手電筒照拖痕 | 本次隨機結果為 `自動失敗`，reference fallback 使用 `失敗` 結果 | 推進至 `evt_meet_ash`，加入 `flag_cryo_cleared` 與 `flag_noise_made` |
| 2 | `app_ash_talk_quarantine`：以檢疫協議交涉 | 本次隨機結果為 `些微失敗` | 推進至 `evt_order_937_reveal`，加入 `flag_science_locked`，Ash 狀態變為 `suspicious` |

骰子結果是隨機的，因此下一次執行可能得到不同的結果層。測試並沒有錯誤地假設必定成功，而是驗證每個合法結果分支都會套用其自身 effects；例如開場偵察只有成功類結果會取得 `item_flashlight`，失敗結果不會假裝取得物品。

## 驗證內容

測試確認固定開場不呼叫 LLM，第一個玩家行動才呼叫一次，Ash 行動再呼叫一次，因此本次共呼叫固定測試 LLM 2 次。兩次 prompt 都包含 reference event context；第一個 action prompt 包含 `evt_cryo_clearance`、`app_cryo_recon` 與「已套用狀態效果」，第二個 Ash prompt 包含 `evt_meet_ash` 及 Ash 的固定世界真相。

測試也確認 reference options 不是直接信任 LLM 回傳的選項，而是由 adapter 根據目前 scene、phase 與前置條件重新建立。兩次玩家行動都經過現有 `performCheck()` 與 `classifyOutcome()`；reference adapter 只讀取引擎產生的 outcome，並依內容包中的 outcomes 表套用結果。

重新讀取 session 後，`referenceState`、`reference_action` 日誌與 history 均存在。測試驗證了 `flag_cryo_cleared`、目前 scene、兩筆 reference action，以及至少兩筆敘事歷史。

## 實際測試結果

```text
V2 smoke test: passed
LLM calls: 2
Opening event: evt_cryo_clearance
After recon: evt_meet_ash
After Ash action: evt_order_937_reveal
Check outcomes: 自動失敗 / 些微失敗
Reference actions persisted: 2
Full project tests: 782 passed, 0 failed
Git diff check: passed
```

## 結論

V2 的 adapter 端到端接線在固定測試 LLM 下正常：固定開場、reference option 產生、骰子判定、結果 fallback、場景推進、Ash 行動、效果套用、事件日誌與存檔回讀都能連成一條完整流程。

目前尚未驗證的部分是 Gemini 真實 API 的文筆品質、Gemini 實際 JSON schema 遵循率與真實網路／額度錯誤。要完成那一層，需要在本地 `.dev.vars` 提供暫時的 `GEMINI_API_KEY`，或讓正式／測試部署提供 Gemini 供應商設定。
