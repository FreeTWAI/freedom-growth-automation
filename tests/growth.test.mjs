import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadCampaignWorkspace, createCampaignDraft, reviseCampaignDraft, recordManualShare,
  prepareCampaignDraft, previewPublication, renderPlainPreview, renderLinePreview,
} from '../src/index.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/campaign.json', import.meta.url), 'utf8'));
const content = { title: '參加作品交流', audience: '社群會員', goal: '邀請提出回饋', draft_text: '這是草稿。' };
const preparation = { ...content, draftText: content.draft_text };
const sourceId = '00000000-0000-4000-8000-000000000003';

test('workspace uses the three pinned operations and preserves authoritative API rows', async () => {
  const rows = { listCampaigns: [fixture], listProjects: [{ project_id: sourceId }], listSupplierProducts: [{ product_id: sourceId }] };
  const calls = [];
  const result = await loadCampaignWorkspace({ async call(operation) { calls.push(operation); return { items: rows[operation], ...(operation === 'listCampaigns' ? { next_offset: null } : {}) }; } });
  assert.deepEqual(calls.sort(), Object.keys(rows).sort());
  assert.deepEqual(result, { campaigns: rows.listCampaigns, projects: rows.listProjects, supplierProducts: rows.listSupplierProducts });
});

test('incompatible API envelopes fail instead of looking like an empty workspace', async () => {
  await assert.rejects(loadCampaignWorkspace({ async call() { return []; } }), /incompatible response/);
});

test('workspace loads all private campaigns through empty and exact-page endings', async () => {
  for (const count of [0, 50, 101]) {
    const campaigns = Array.from({ length: count }, (_, index) => ({ ...fixture, campaign_id: `campaign-${index}` }));
    const projects = [{ project_id: sourceId }], supplierProducts = [{ product_id: sourceId }];
    const offsets = [], pages = [];
    const result = await loadCampaignWorkspace({ async call(operation, options) {
      if (operation === 'listProjects') return { items: projects };
      if (operation === 'listSupplierProducts') return { items: supplierProducts };
      assert.equal(operation, 'listCampaigns');
      assert.equal(options.query.limit, 50);
      const { offset } = options.query;
      offsets.push(offset);
      const page = { items: campaigns.slice(offset, offset + 50), next_offset: offset + 50 < count ? offset + 50 : null };
      pages.push(page);
      return page;
    } });
    assert.deepEqual(result, { campaigns, projects, supplierProducts });
    assert.deepEqual(offsets, count > 50 ? [0, 50, 100] : [0]);
    assert.equal(pages[0].items.length, Math.min(count, 50));
  }
});

test('a later campaign authorization failure rejects the whole workspace without retry', async () => {
  const failure = Object.assign(new Error('session expired'), { status: 401 });
  const offsets = [];
  const client = { async call(operation, options) {
    if (operation !== 'listCampaigns') return { items: [] };
    offsets.push(options.query.offset);
    if (options.query.offset === 0) return { items: [fixture], next_offset: 50 };
    throw failure;
  } };
  await assert.rejects(loadCampaignWorkspace(client), error => error === failure);
  assert.deepEqual(offsets, [0, 50]);
});

test('invalid campaign continuation rejects instead of returning partial drafts or looping', async () => {
  for (const next_offset of [undefined, 0, -1, '50', 1.5]) {
    let campaignReads = 0;
    await assert.rejects(loadCampaignWorkspace({ async call(operation) {
      if (operation !== 'listCampaigns') return { items: [] };
      campaignReads++;
      return { items: [fixture], next_offset };
    } }), /next_offset/);
    assert.equal(campaignReads, 1);
  }
});

test('campaign creation forwards exactly the caller command and retry key', async () => {
  const calls = [];
  const client = { async call(operation, options) { calls.push({ operation, options }); return fixture; } };
  const body = prepareCampaignDraft({ ...preparation, source: { kind: 'manual_brief', brief: '示範活動' } });
  const options = { idempotencyKey: 'campaign-create-0001' };
  assert.equal(await createCampaignDraft(client, body, options), fixture);
  await createCampaignDraft(client, body, options);
  assert.deepEqual(calls[0], { operation: 'createCampaign', options: { body, idempotencyKey: options.idempotencyKey } });
  assert.deepEqual(calls[0], calls[1]);
});

test('revision sends the saved optimistic version and does not change source metadata', async () => {
  const before = structuredClone(fixture);
  let sent;
  const client = { async call(operation, options) { sent = { operation, options }; return { ...fixture, aggregate_version: 3 }; } };
  await reviseCampaignDraft(client, fixture, content, { idempotencyKey: 'campaign-revise-0001' });
  assert.deepEqual(sent, { operation: 'reviseCampaign', options: { body: content, params: { id: fixture.campaign_id }, idempotencyKey: 'campaign-revise-0001', version: 2 } });
  assert.deepEqual(fixture, before);
});

test('manual share recording preserves explicit version and is only a Platform command', async () => {
  const calls = [];
  const body = { channel: 'example', share_url: 'https://example.com/manual-share', note: 'User-entered example; not verified.' };
  await recordManualShare({ async call(...args) { calls.push(args); return fixture; } }, fixture, body, { idempotencyKey: 'share-record-0001', version: 5 });
  assert.deepEqual(calls, [['recordShare', { body, params: { id: fixture.campaign_id }, idempotencyKey: 'share-record-0001', version: 5 }]]);
});

test('manual share recording rejects invalid URLs, non-HTTP(S) protocols, and embedded credentials', async () => {
  const client = { async call() { assert.fail('No request should be made.'); } };
  const invalidUrls = [
    'not_a_url',
    'ftp://example.com/share',
    'javascript:alert(1)',
    'https://user:pass@example.com',
    'http://user@example.com'
  ];
  for (const share_url of invalidUrls) {
    const body = { channel: 'example', share_url };
    await assert.rejects(recordManualShare(client, fixture, body, { idempotencyKey: 'share-record-fail' }), /share_url|URL/);
  }
});

test('writes without an explicit retry key and revisions without a usable version never reach API', async () => {
  const client = { async call() { assert.fail('No request should be made.'); } };
  await assert.rejects(createCampaignDraft(client, content), /idempotencyKey/);
  await assert.rejects(reviseCampaignDraft(client, fixture, content), /idempotencyKey/);
  await assert.rejects(recordManualShare(client, fixture, {}, { idempotencyKey: '' }), /idempotencyKey/);
  for (const version of [0, -1, '2', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(reviseCampaignDraft(client, fixture, content, { idempotencyKey: 'revise-0001', version }), /aggregate_version/);
  }
});

test('client helpers reject operations with missing or invalid client or campaign_id', async () => {
  await assert.rejects(loadCampaignWorkspace(null), /Platform client/);
  await assert.rejects(loadCampaignWorkspace({}), /Platform client/);
  await assert.rejects(reviseCampaignDraft({ call: () => {} }, null, content, { idempotencyKey: 'key' }), /campaign_id/);
  await assert.rejects(reviseCampaignDraft({ call: () => {} }, { campaign_id: '' }, content, { idempotencyKey: 'key' }), /campaign_id/);
});

test('conflicts and ambiguous network failures propagate without automatic command retries', async () => {
  for (const failure of [Object.assign(new Error('version_conflict'), { status: 412 }), new TypeError('fetch failed')]) {
    let requests = 0;
    const client = { async call() { requests++; throw failure; } };
    await assert.rejects(reviseCampaignDraft(client, fixture, content, { idempotencyKey: 'retry-same-0001' }), error => error === failure);
    assert.equal(requests, 1);
  }
});

test('draft preparation selects exactly one canonical source and never invents a version', () => {
  const project = prepareCampaignDraft({ ...preparation, source: { kind: 'oss_project', project_id: sourceId } });
  assert.deepEqual(project, { ...content, source_project_id: sourceId, source_supplier_product_id: null, source_brief: '' });
  const product = prepareCampaignDraft({ ...preparation, source: { kind: 'supplier_product', product_id: sourceId } });
  assert.deepEqual(product, { ...content, source_project_id: null, source_supplier_product_id: sourceId, source_brief: '' });
  const manual = prepareCampaignDraft({ ...preparation, source: { kind: 'manual_brief', brief: '  由會員提供的活動簡述  ' } });
  assert.equal(manual.source_brief, '由會員提供的活動簡述');
  assert.equal(manual.source_project_id, null);
  assert.equal(manual.source_supplier_product_id, null);
  assert.equal('source_version_id' in project, false);
});

test('draft preparation rejects missing sources, URLs masquerading as IDs, and content outside API bounds', () => {
  const valid = { ...preparation, source: { kind: 'manual_brief', brief: '示範' } };
  assert.throws(() => prepareCampaignDraft(preparation), /Choose one/);
  assert.throws(() => prepareCampaignDraft({ ...valid, source: { kind: 'oss_project', project_id: 'https://github.com/example/repo' } }), /UUID/);
  assert.throws(() => prepareCampaignDraft({ ...valid, source: { kind: 'manual_brief', brief: '   ' } }), /Choose one/);
  assert.throws(() => prepareCampaignDraft({ ...valid, title: 'x'.repeat(121) }), /title/);
  assert.throws(() => prepareCampaignDraft({ ...valid, draftText: '' }), /draft_text/);
});

test('publication preview copies exact immutable source evidence and explicitly does not publish', () => {
  const original = structuredClone(fixture);
  const preview = previewPublication(fixture);
  assert.equal(preview.mode, 'local_preview');
  assert.equal(preview.publication_status, 'not_published');
  assert.equal(preview.provider_action, false);
  assert.equal(preview.source_sha256, fixture.source_sha256);
  assert.equal(preview.content_sha256, fixture.content_sha256);
  assert.equal(preview.aggregate_version, fixture.aggregate_version);
  assert.deepEqual(preview.source_snapshot, fixture.source_snapshot);
  preview.source_snapshot.brief = 'local edit';
  assert.deepEqual(fixture, original);
});

test('LINE preview is clearly unavailable for delivery and keeps user text literal', () => {
  const campaign = { ...fixture, draft_text: '<script>not HTML</script>\n@everyone' };
  const preview = previewPublication(campaign, { channel: 'line' });
  assert.equal(preview.content.delivery, 'unavailable');
  assert.equal(preview.content.provider_validation, 'not_performed');
  assert.deepEqual(preview.content.messages, [{ type: 'text', text: `${campaign.title}\n\n${campaign.draft_text}` }]);
  assert.equal(renderPlainPreview(campaign).media_type, 'text/plain');
});

test('preview refuses unpinned drafts and unsupported channels', () => {
  for (const invalid of [{ ...fixture, source_snapshot: null }, { ...fixture, source_sha256: '' }, { ...fixture, content_sha256: null }]) {
    assert.throws(() => previewPublication(invalid), /source_snapshot/);
  }
  assert.throws(() => previewPublication(fixture, { channel: 'send-now' }), /Supported local preview/);
});

test('previewPublication rejects missing campaign_id or invalid aggregate_version', () => {
  assert.throws(() => previewPublication(null), /Preview a saved campaign/);
  assert.throws(() => previewPublication({ ...fixture, campaign_id: null }), /Preview a saved campaign/);
  assert.throws(() => previewPublication({ ...fixture, aggregate_version: null }), /Preview a saved campaign/);
  assert.throws(() => previewPublication({ ...fixture, aggregate_version: 0 }), /Preview a saved campaign/);
});

test('render plain and line preview rejects invalid campaigns missing title or draft_text', () => {
  assert.throws(() => renderPlainPreview(null), /title and draft_text/);
  assert.throws(() => renderLinePreview({ title: 'A title' }), /title and draft_text/);
  assert.throws(() => renderPlainPreview({ draft_text: 'A draft' }), /title and draft_text/);
});

test('media capability manifest cannot be interpreted as an active worker', async () => {
  const manifest = JSON.parse(await readFile(new URL('../services/media-worker/capabilities.json', import.meta.url), 'utf8'));
  assert.equal(manifest.status, 'planned');
  assert.equal(manifest.executable, false);
  assert.deepEqual(manifest.operations, []);
});
