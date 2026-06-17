/**
 * extractInvoice.js — real Claude Vision API implementation skeleton.
 *
 * NOT used in demo mode. In production, replace mockExtract() calls
 * in App.jsx with extractFromImage() after setting VITE_ANTHROPIC_API_KEY.
 *
 * Note on complex documents:
 *   - Matheson invoice: UN hazmat line items, handwritten annotations,
 *     no visible PO number — requires post-extraction PO lookup.
 *   - Sharpgas invoice: statement format with multiple transactions.
 *     The extractor picks the most recent transaction or flags for manual review.
 */

const SYSTEM_PROMPT = `You are an invoice data extraction system. Extract structured data from the invoice image.
Return ONLY valid JSON with no markdown, no preamble. If a field is not present, use null.`;

const USER_PROMPT = `Extract all invoice fields from this image. Return JSON with these exact keys:
{
  "vendorRaw": "string",
  "invoiceNumber": "string",
  "date": "string (as it appears on the document)",
  "poNumber": "string or null",
  "lineItems": [{ "desc": "string", "qty": number, "unit": number, "total": number }],
  "subtotal": number,
  "tax": number,
  "total": number,
  "goodsReceipt": false,
  "duplicate": false
}`;

/**
 * extractFromImage(base64Image, mediaType) — calls Anthropic API.
 * @param {string} base64Image — base64-encoded image data
 * @param {string} mediaType   — e.g. "image/jpeg", "image/png"
 * @returns {object|null}       parsed extraction JSON, or null on failure
 */
export async function extractFromImage(base64Image, mediaType = 'image/jpeg') {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            { type: 'text', text: USER_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error('Anthropic API error:', response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  try {
    return JSON.parse(text);
  } catch {
    console.error('Failed to parse extraction JSON:', text);
    return null;
  }
}
