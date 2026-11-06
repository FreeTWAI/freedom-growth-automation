function draftText(campaign) {
  if (!campaign || typeof campaign.title !== 'string' || typeof campaign.draft_text !== 'string') {
    throw new TypeError('A campaign title and draft_text are required.');
  }
  return `${campaign.title}\n\n${campaign.draft_text}`;
}

/**
 * Plain text only: the caller must use textContent, never treat this as HTML.
 *
 * @param {Object} campaign - The campaign object to format.
 * @returns {Object} A preview payload representing a plain text media format.
 */
export function renderPlainPreview(campaign) {
  return { channel: 'plain', media_type: 'text/plain', text: draftText(campaign) };
}

/**
 * LINE-shaped local text preview, not a validated or sent provider request.
 *
 * @param {Object} campaign - The campaign object to format.
 * @returns {Object} A preview payload representing a LINE message format.
 */
export function renderLinePreview(campaign) {
  const text = draftText(campaign);
  return {
    channel: 'line',
    messages: [{ type: 'text', text }],
    delivery: 'unavailable',
    provider_validation: 'not_performed',
  };
}
