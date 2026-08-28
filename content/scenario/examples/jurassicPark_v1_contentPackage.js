// 《努布拉島：維修站撤離》NPC 演出素材包（narrative package）。
//
// 這份檔案只提供玩家可見的 NPC 語氣、外在形象、關係反應、可觀察行為與線索反應；
// canonical reference（jurassicPark_v1_gm_reference.json）仍是事件、effects、
// 位置、物品、威脅與結局的唯一真相。這裡的任何內容都不能新增或暗示未經
// reference 授權的物品、傷勢、關係數值或秘密揭露。
//
// 產出流程：這份檔案是 docs/GEMINI_JURASSIC_NPC_DIALOGUE_PROMPT.md 產生內容的落地位置。
// 把 Gemini 回覆的 JSON 貼進 `npcs` 陣列（形狀完全比照
// alienNostromo_v2_contentPackage.js 的 npcs[] 寫法），其餘欄位不需要动。
// 貼入後跑 `node --test test/jurassicParkV1.test.js` 確認沒有破壞既有測試，
// 並人工核對是否有秘密外洩（見該份 prompt 文件的「禁止內容」一節）。
//
// 目前 `npcs` 是空陣列：在還沒有 Gemini 產出內容之前，
// `buildNarrativeNpcPromptBlock()` 對本副本會回傳空字串，AI GM 完全不受影響
// （沒有這份資料時，行為與貼入前一致，不會噴錯）。

export default {
  sourceFile: null,
  sourceTitle: "《努布拉島：維修站撤離》NPC 演出素材",
  sourcePackId: "scenario.jurassic-park-01-v1",
  conversionStatus: "pending-gemini-generation",
  npcs: [],
};
