# Freedom Growth Automation

<!-- freedom-repository-guide:start -->
## 在自由工坊的位置

[自由工坊](https://freetwai.com) 讓會員先完成定位、選擇公會並領取 Repo 技能書，再以供貨、商店、開源作品、行銷與小隊共同完成成果。

行銷公會的活動草稿、來源引用與人工分享紀錄工具。 已提供 campaign helpers、文案／LINE 文字離線預覽與人工分享紀錄接線。

沒有 LINE 傳訊、自動社群發布、背景 worker 排程、真實流量統計或影片渲染。

本 repo 的維護者負責「行銷公會的活動草稿、來源引用與人工分享紀錄工具。」這個模組；公會職稱與自填 GitHub slug 不授予寫入權。

程式／內容入口：[src/index.mjs](src/index.mjs)、[services/campaign-worker/](services/campaign-worker/)、[services/publication-worker/](services/publication-worker/)、[services/media-worker/](services/media-worker/)、[packages/channel-adapters/](packages/channel-adapters/)。協作先讀 [CONTRIBUTING.md](CONTRIBUTING.md)，讓 Agent 讀 [AGENTS.md](AGENTS.md)；從[本倉 Issues](https://github.com/FreeTWAI/freedom-growth-automation/issues)認領、[查看既有 PR](https://github.com/FreeTWAI/freedom-growth-automation/pulls)避免重工。

活動與分享紀錄在中央平台；這裡組合／預覽公開或已授權資料。不保存會員 DB；文字 preview 不代表已發布、已送達或已有成效。 跨 repo 的協定由[中央平台](https://github.com/FreeTWAI/freedom-platform)維護。
<!-- freedom-repository-guide:end -->

這個 repository 提供行銷模組的可重用模板與 Platform API client helpers。作為 `freedom-platform` 的使用端，會員、權限、商品、作品、活動草稿與分享紀錄仍由 Platform 和中央資料庫管理。**本 repo 不另建帳號或第二份資料庫。**

本版功能包含整理活動草稿、引用供貨商品或開源作品、修改文案、留下人工分享紀錄，並在本機產生純文字／LINE 文字預覽。
**重要限制：本版本沒有自動對外發布、LINE 傳訊、流量指標、付款、分潤、影片渲染或背景 job 執行。**

## 目錄與成熟度

本專案將核心模組依成熟度區分，開發者應了解每個模組目前的狀態：

| 路徑 | 現在的能力 |
| --- | --- |
| `src/` | 真實 Platform operation 的 client helpers |
| `services/campaign-worker/` | 純函式草稿準備；尚無 Queue consumer 或 job claim |
| `services/publication-worker/` | 已保存草稿的本機預覽；保留來源快照、digest 與文案版本 |
| `packages/channel-adapters/` | 純文字及 LINE 形狀的文字預覽；沒有 provider SDK／發送動作 |
| `services/media-worker/` | 明確標 `planned`、`executable:false` 的能力表，沒有 executable stub |
| `tests/` | 命令／版本傳遞、重試邊界、錯誤傳遞與來源保留測試 |

## 本機使用與測試

需要 Node.js 24。目前沒有依賴第三方執行工具。

```sh
# 執行測試
npm test

# 執行本機草稿預覽
npm run preview
```

`npm run preview` 使用明確標為虛構的 sanitized fixture。該操作不登入、不連網、不寫資料。
瀏覽器可直接 import `src/index.mjs`，library 本身不依賴 Node.js 核心 API。

## API Specification & Core Modules

主程式提供 `vendor/freedom-platform/client.mjs` 的 pinned client instance。通訊契約、操作名稱與 vendor 檔皆由 Platform 產生，請依據 repo 根目錄的整合 manifest 為準。**本 repo 不自行發明 API 或重作驗證規則。**

### 使用範例 (Usage Examples)

以下示範如何使用 helpers 進行資料的準備、預覽及串接。

```js
import {
  loadCampaignWorkspace, prepareCampaignDraft, createCampaignDraft,
  reviseCampaignDraft, recordManualShare, previewPublication,
} from './src/index.mjs';

// 1. 初始化工作區
// client 由整合主程式依 pinned SDK 建立，持有本次登入的短效工作階段。
const workspace = await loadCampaignWorkspace(client);

// 2. 準備草稿
const body = prepareCampaignDraft({
  title: '作品使用交流',
  audience: '對作品有興趣的會員',
  goal: '收集使用回饋',
  draftText: '歡迎分享你實際使用這件作品的經驗。',
  // source 必須是 manual_brief、oss_project 或 supplier_product 其中之一
  source: { kind: 'manual_brief', brief: '由本人提出、尚未發布的社群交流構想' },
});

// 3. 建立並保存草稿
// 在送出前保存 key + exact body；連線結果未知時沿用同一組重試以確保冪等性 (idempotency)。
const command = { body, idempotencyKey: crypto.randomUUID() };
const saved = await createCampaignDraft(client, command.body, command);

// 4. 本機預覽
const preview = previewPublication(saved, { channel: 'line' });
// 註: preview.provider_action === false；這裡不會觸發真實發布或傳訊。

// 5. 修改草稿 (只修改文案，原始來源快照保留)
const revised = await reviseCampaignDraft(client, saved, {
  title: saved.title, audience: saved.audience, goal: saved.goal,
  draft_text: '更新後的草稿，仍未發布。',
}, { idempotencyKey: crypto.randomUUID() });

// 6. 人工分享紀錄
// 只有真人已在外部分享後，才主動呼叫 recordManualShare：
// await recordManualShare(client, revised, {
//   channel: '網站', share_url: 'https://example.com/already-published', note: '本人填寫',
// }, { idempotencyKey: crypto.randomUUID() });
```

### 操作對照與行為約束

| Helper 方法 | SDK operation | 資料行為與一致性約束 |
| --- | --- | --- |
| `loadCampaignWorkspace(client)` | `listCampaigns`, `listProjects`, `listSupplierProducts` | 活動依 `next_offset` 每頁最多 50 筆讀完，回傳完整 `{campaigns, projects, supplierProducts}`；API 格式或回應不符則拋錯。 |
| `createCampaignDraft(client, body, options)` | `createCampaign` | 必須提供 `options.idempotencyKey`；Platform 將驗證來源權限並保存確切來源版本。 |
| `reviseCampaignDraft(client, campaign, body, options)` | `reviseCampaign` | 內部傳遞 `params.id`、key 及 `version`。此操作只修改文案，原始來源快照將被保留。 |
| `recordManualShare(client, campaign, body, options)` | `recordShare` | 內部傳遞 `params.id`、key 及 `version`。此為 `self_reported`，不代表已核實。 |

**重要一致性規則：**
- **更新衝突處理**：更新預設使用 `campaign.aggregate_version`。如有明確已知版本，可透過 `options.version` 傳入。衝突與網路錯誤原樣向上傳遞，系統不會自動重試、換 key 或覆蓋別人的更新。
- **重試限制**：重試必須使用完全相同的內容、版本與 idempotencyKey。若是內容變更，則視為新命令，應產生並使用新的 idempotencyKey。
- **來源權限**：來源專案列表可能包含別人的作品，建立草稿時仍由 Platform 檢查來源管理權。
- **資料分頁**：活動清單讀取到 `next_offset: null` 才回傳工作區。如果空清單則正常回傳，若後續任一頁被拒或失敗，整次讀取操作即宣告失敗，不返回部分草稿。
- **安全注意事項**：Browser session 必須走 Platform 同源入口或經授權的同源 reverse proxy。不要開放任意 CORS，不要將 staging 登入視為正式外部 API 授權，嚴禁將 token、secret 或 DB URL commit 到任何程式碼倉庫。

更詳細的系統架構與排程說明，請參見 [Architecture Guide](docs/architecture.md)。

preview 中的 hash 從 Platform 回應保留，沒有在 client 端重新簽章或宣稱驗真。
文字只能作純文字呈現，不可直接交給 `innerHTML`。LINE preview 並未驗證正式
provider 請求限制、收件人或 channel 權限，不能直接視為可發送任務。

未來啟用 publication/media worker，需實作主規格的版本化 job registry、exact job
claim、lease/fencing、heartbeat、完成／失敗回報、reconciliation、各自唯一 Queue
consumer 與 named broker capability；不直接連 Platform DB，也不存長效 provider
secret。現有 draft API 不等於這套尚未啟用的 job 協定。

中央架構來源：
[Platform repo 與 ownership](https://github.com/FreeTWAI/freedom-platform/blob/main/docs/platform-plan/02-architecture-repositories.md)、
[模組擴建設計](https://github.com/FreeTWAI/freedom-platform/blob/main/docs/development/module-expansion-design.md)。
