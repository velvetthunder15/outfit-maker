import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { callGemini, validateOutfitResponse, OUTFIT_SCHEMA } from '../src/lib/gemini.ts';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
after(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });
const outfit = {
  title: 'Look', aesthetic: 'casual', vibe: 'Relaxed',
  pieces: [{ slot: 'top', item_id: null, description: 'Shirt', reason: 'Comfort' }],
  color_story: 'Blue', palette: ['#0000ff'], why_it_works: 'Simple', styling_tips: ['Tuck'],
  alternatives: [{ slot: 'top', description: 'Tee' }], missing_pieces: [],
  weather_note: 'Warm', pinterest_query: 'blue shirt', reference_keywords: 'blue shirt',
};
const valid = JSON.stringify(outfit);
const opts = { parts: [{ text: 'outfit' }], schema: OUTFIT_SCHEMA, validateResponse: validateOutfitResponse };
const gemini = (text) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const compat = (text) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

test('accepts valid outfits, optional fields, null item IDs and fenced JSON', () => {
  validateOutfitResponse(valid);
  validateOutfitResponse('```json\n' + valid + '\n```');
});
for (const [name, value] of [
  ['missing fields', {}],
  ['missing pieces', Object.fromEntries(Object.entries(outfit).filter(([k]) => k !== 'pieces'))],
  ['wrong array type', { ...outfit, pieces: {} }],
  ['wrong nested type', { ...outfit, pieces: [{ slot: 'top', description: 4, reason: 'ok' }] }],
  ['invalid slot', { ...outfit, pieces: [{ slot: 'socks', description: 'x', reason: 'x' }] }],
  ['wrong optional type', { ...outfit, grooming_note: 3 }],
  ['wrong nested item ID type', { ...outfit, alternatives: [{ slot: 'top', description: 'x', item_id: 2 }] }],
]) test('rejects ' + name, () => assert.throws(() => validateOutfitResponse(JSON.stringify(value))));
test('rejects malformed JSON', () => assert.throws(() => validateOutfitResponse('{"title":')));

test('Gemini invalid JSON and incomplete outfits fall through to a valid model', async () => {
  process.env.GEMINI_API_KEY = 'fake'; delete process.env.GROQ_API_KEY; delete process.env.OPENROUTER_API_KEY;
  const urls = []; const replies = ['{"title":', '{}', valid];
  globalThis.fetch = async (url) => { urls.push(String(url)); return gemini(replies.shift()); };
  const result = await callGemini(opts);
  assert.equal(result.text, valid);
  assert.equal(urls.length, 3);
  assert.match(urls[0], /gemini-3\.5-flash:/); assert.match(urls[1], /gemini-3\.8-flash:/);
});

test('compatible provider invalid outfit falls through to the next provider model', async () => {
  process.env.GEMINI_API_KEY = 'fake'; process.env.GROQ_API_KEY = 'fake'; delete process.env.OPENROUTER_API_KEY;
  const models = [];
  globalThis.fetch = async (url, request) => {
    if (String(url).includes('generativelanguage')) return new Response('', { status: 404 });
    const model = JSON.parse(request.body).model; models.push(model);
    return compat(models.length === 1 ? '{}' : valid);
  };
  assert.equal((await callGemini(opts)).text, valid);
  assert.deepEqual(models, ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
});

test('all invalid models produce an error', async () => {
  process.env.GEMINI_API_KEY = 'fake'; delete process.env.GROQ_API_KEY; delete process.env.OPENROUTER_API_KEY;
  let calls = 0; globalThis.fetch = async () => { calls++; return gemini('{}'); };
  await assert.rejects(callGemini(opts), /invalid response/);
  assert.equal(calls, 4);
});

test('calls without outfit validation keep existing behavior', async () => {
  process.env.GEMINI_API_KEY = 'fake'; globalThis.fetch = async () => gemini('{}');
  assert.equal((await callGemini({ parts: [{ text: 'other' }] })).text, '{}');
});
