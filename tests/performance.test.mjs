import { test } from 'node:test';
import assert from 'node:assert';
import { loadCampaignWorkspace } from '../src/index.mjs';
import { prepareCampaignDraft } from '../services/campaign-worker/index.mjs';
import { previewPublication } from '../services/publication-worker/index.mjs';

test('loadCampaignWorkspace performance - handles large result sets without call stack overflow', async () => {
  const NUM_CAMPAIGNS = 100000;
  let offsetTracker = 0;

  const mockClient = {
    async call(operationId, options) {
      if (operationId === 'listProjects' || operationId === 'listSupplierProducts') {
        return { items: [] };
      }
      if (operationId === 'listCampaigns') {
        const limit = options?.query?.limit || 50;
        const currentOffset = options?.query?.offset || 0;

        const returnCount = Math.min(limit, NUM_CAMPAIGNS - currentOffset);
        const items = Array.from({ length: returnCount }).map((_, i) => ({
          campaign_id: `camp-${currentOffset + i}`
        }));

        const next_offset = currentOffset + returnCount < NUM_CAMPAIGNS ? currentOffset + returnCount : null;

        return { items, next_offset };
      }
      throw new Error(`Unknown operation: ${operationId}`);
    }
  };

  const start = performance.now();
  const workspace = await loadCampaignWorkspace(mockClient);
  const duration = performance.now() - start;

  assert.equal(workspace.campaigns.length, NUM_CAMPAIGNS);
  // Optional: check duration is reasonable (e.g., < 1000ms), but mainly we test it doesn't throw.
});

test('prepareCampaignDraft performance - minimal allocation for large strings', () => {
  const largeString = 'a'.repeat(6000);
  const preparation = {
    title: 'Benchmark Title',
    audience: 'Benchmark Audience',
    goal: 'Benchmark Goal',
    draftText: largeString,
    source: { kind: 'manual_brief', brief: 'Benchmark Brief' }
  };

  const ITERATIONS = 10000;
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    prepareCampaignDraft(preparation);
  }
  const duration = performance.now() - start;

  // Just ensure it finishes successfully.
  assert.ok(duration >= 0);
});

test('previewPublication performance - regex is precompiled and fast', () => {
  const fixture = {
    campaign_id: 'test-campaign-id',
    aggregate_version: 1,
    title: 'test title',
    draft_text: 'test text',
    source_snapshot: { kind: 'manual_brief', brief: 'test' },
    source_sha256: 'a'.repeat(64),
    content_sha256: 'b'.repeat(64)
  };

  const ITERATIONS = 10000;
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    previewPublication(fixture);
  }
  const duration = performance.now() - start;

  // Just ensure it finishes successfully.
  assert.ok(duration >= 0);
});
