import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import worker from '../src/index.ts';

// Node adapter for the Workers-only incremental digest API; R2 writes are observed below.
class DigestStream extends WritableStream {
  constructor() {
    const hash = createHash('sha256');
    let resolve, reject;
    const digest = new Promise((a, b) => { resolve = a; reject = b; });
    super({ write(bytes) { hash.update(bytes); }, close() { const b = hash.digest(); resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }, abort(error) { reject(error); } });
    this.digest = digest;
  }
}
Object.defineProperty(crypto, 'DigestStream', { value: DigestStream });
const partSize = 5 * 1024 * 1024;
const zip = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function bucket({ failPart = false } = {}) {
  const state = { sizes: [], complete: false, aborted: false, puts: [], hash: createHash('sha256') };
  return { state,
    async put(key, value) { state.puts.push(key); if (!key.endsWith('.json')) state.hash.update(value); },
    async createMultipartUpload() { return {
      async uploadPart(partNumber, value) { if (failPart) throw new Error('R2 unavailable'); state.sizes.push(value.byteLength); state.hash.update(value); return { partNumber, etag: String(partNumber) }; },
      async abort() { state.aborted = true; },
      async complete() { state.complete = true; },
    }; },
  };
}
function request(chunks, headers = {}, { fail = false, onCancel = () => {} } = {}) {
  let index = 0;
  return new Request('https://example.com/submit?slug=event', { method: 'POST', duplex: 'half', headers,
    body: new ReadableStream({ pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else if (fail) controller.error(new Error('disconnected'));
      else controller.close();
    }, cancel() { onCancel(); } }),
  });
}
async function run(req, store, max = 536870912) {
  return worker.fetch(req, { ASSETS: store, MAX_UPLOAD_BYTES: String(max), ALLOWED_ORIGINS: '*' });
}
test('small archive validates split magic and writes matching metadata', async () => {
  const store = bucket();
  const res = await run(request([zip.slice(0, 1), zip.slice(1, 3), zip.slice(3)], { 'x-sha256': sha(zip) }), store);
  assert.equal(res.status, 202); assert.equal(store.state.puts.length, 2);
  assert.equal(store.state.hash.digest('hex'), sha(zip));
});
test('multipart upload remains bounded and preserves exact content', async () => {
  const bytes = new Uint8Array(partSize * 2 + 19); bytes.set(zip);
  const store = bucket();
  const res = await run(request([bytes.subarray(0, 2), bytes.subarray(2)], { 'x-sha256': sha(bytes) }), store);
  assert.equal(res.status, 202); assert.equal(store.state.complete, true);
  assert.deepEqual(store.state.sizes, [partSize, partSize, 19]);
  assert.equal(store.state.hash.digest('hex'), sha(bytes));
});
test('checksum mismatch aborts multipart before completion', async () => {
  const bytes = new Uint8Array(partSize + 1); bytes.set(zip);
  const store = bucket();
  const res = await run(request([bytes], { 'x-sha256': '0'.repeat(64) }), store);
  assert.equal(res.status, 422); assert.equal(store.state.aborted, true);
  assert.equal(store.state.complete, false); assert.equal(store.state.puts.length, 0);
});
test('unknown-length overflow aborts and cancels upstream', async () => {
  const bytes = new Uint8Array(partSize); bytes.set(zip);
  const store = bucket(); let cancelled = false;
  const res = await run(request([bytes, zip, zip, zip], { 'x-sha256': '0'.repeat(64) }, { onCancel() { cancelled = true; } }), store, partSize);
  assert.equal(res.status, 413); assert.equal(store.state.aborted, true); assert.equal(cancelled, true);
});
for (const mode of ['disconnect', 'r2-failure']) test(`${mode} aborts incomplete multipart`, async () => {
  const bytes = new Uint8Array(partSize); bytes.set(zip);
  const store = bucket({ failPart: mode === 'r2-failure' });
  const res = await run(request([bytes], { 'x-sha256': sha(bytes) }, { fail: mode === 'disconnect' }), store);
  assert.equal(res.status, 503); assert.equal(store.state.aborted, true); assert.equal(store.state.complete, false);
});
for (const [name, chunks, headers, max, expected] of [
  ['missing checksum', [zip], {}, 100, 400],
  ['invalid checksum', [zip], { 'x-sha256': 'xyz' }, 100, 400],
  ['declared overflow', [zip], { 'x-sha256': sha(zip), 'content-length': '101' }, 100, 413],
  ['truncated body', [zip], { 'x-sha256': sha(zip), 'content-length': '9' }, 100, 400],
  ['invalid zip fourth byte', [new Uint8Array([80, 75, 3, 0])], { 'x-sha256': '0'.repeat(64) }, 100, 415],
  ['empty', [], { 'x-sha256': sha(new Uint8Array()) }, 100, 400],
  ['invalid config', [zip], { 'x-sha256': sha(zip) }, -1, 503],
]) test(name, async () => {
  const store = bucket(); const res = await run(request(chunks, headers), store, max);
  assert.equal(res.status, expected); assert.equal(store.state.puts.length, 0); assert.equal(store.state.complete, false);
});
