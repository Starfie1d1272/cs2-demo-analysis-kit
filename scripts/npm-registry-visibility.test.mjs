import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { waitForRegistryVersions } from "./lib/npm-registry-visibility.mjs";

const target = { name: "@cs2dak/core", version: "4.0.0" };
async function fixture(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { registryUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 1000, intervalMs: 5, requestTimeoutMs: 100, log() {} };
}
function respond(res, status, body = target) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

test("waits for delayed visibility and does not recheck confirmed packages", async t => {
  const counts = new Map();
  const second = { name: "@cs2dak/maps", version: "2.0.0" };
  const opts = await fixture(t, (req, res) => {
    const count = (counts.get(req.url) ?? 0) + 1;
    counts.set(req.url, count);
    assert.equal(req.headers["cache-control"], "no-cache");
    const value = req.url.includes("maps") ? second : target;
    respond(res, value === second && count < 3 ? 404 : 200, value);
  });
  const confirmedCounts = new Map();
  opts.log = message => {
    for (const item of [target, second]) {
      if (message === `npm version confirmed: ${item.name}@${item.version}`) {
        const path = `/${encodeURIComponent(item.name)}/${encodeURIComponent(item.version)}`;
        confirmedCounts.set(path, counts.get(path));
      }
    }
  };
  const result = await waitForRegistryVersions([target, second], opts);
  assert.deepEqual(result, { confirmed: [target, second], pending: [], errors: [] });
  const corePath = `/${encodeURIComponent(target.name)}/${encodeURIComponent(target.version)}`;
  const mapsPath = `/${encodeURIComponent(second.name)}/${encodeURIComponent(second.version)}`;
  assert.ok(confirmedCounts.get(corePath) >= 1);
  assert.ok(confirmedCounts.get(mapsPath) >= 3);
  assert.equal(counts.get(corePath), confirmedCounts.get(corePath));
  assert.equal(counts.get(mapsPath), confirmedCounts.get(mapsPath));
});

test("retries transient HTTP and connection errors", async t => {
  let calls = 0;
  const opts = await fixture(t, (req, res) => {
    calls++;
    if (calls === 1) return req.socket.destroy();
    respond(res, [408, 429, 503][calls - 2] ?? 200);
  });
  const result = await waitForRegistryVersions([target], opts);
  assert.deepEqual(result.confirmed, [target]);
  assert.equal(calls, 5);
});

for (const [status, body, reason] of [
  [401, {}, "HTTP 401"],
  [403, {}, "HTTP 403"],
  [200, null, "mismatched"],
  [200, { ...target, version: "wrong" }, "mismatched"],
]) {
  test(`fails closed for ${status} ${JSON.stringify(body)}`, async t => {
    let calls = 0;
    const opts = await fixture(t, (_req, res) => { calls++; respond(res, status, body); });
    const result = await waitForRegistryVersions([target], opts);
    assert.equal(calls, 1);
    assert.equal(result.confirmed.length, 0);
    assert.match(result.errors[0].reason, new RegExp(reason));
  });
}

test("invalid JSON fails immediately", async t => {
  const opts = await fixture(t, (_req, res) => { res.writeHead(200); res.end("broken"); });
  const result = await waitForRegistryVersions([target], opts);
  assert.match(result.errors[0].reason, /invalid JSON/);
});

test("shared deadline preserves partial confirmation and aborts hanging response bodies", async t => {
  const second = { name: "@cs2dak/maps", version: "2.0.0" };
  const opts = await fixture(t, (req, res) => {
    if (req.url.includes("core")) return respond(res, 200);
    res.writeHead(200); res.write('{"name":');
  });
  const start = performance.now();
  const result = await waitForRegistryVersions([target, second], { ...opts, timeoutMs: 150, requestTimeoutMs: 1000 });
  assert.deepEqual(result.confirmed, [target]);
  assert.equal(result.pending[0].target, second);
  assert.equal(result.errors.length, 0);
  assert.ok(performance.now() - start < 1500, "request must respect release deadline");
});

test("persistent 404 reaches deadline", async t => {
  const opts = await fixture(t, (_req, res) => respond(res, 404));
  const result = await waitForRegistryVersions([target], { ...opts, timeoutMs: 100 });
  assert.equal(result.confirmed.length, 0);
  assert.match(result.pending[0].reason, /HTTP 404/);
});

test("rejects invalid timeout values before requesting registry", async () => {
  for (const timeoutMs of [0, -1, NaN, Infinity, 1.5]) {
    await assert.rejects(waitForRegistryVersions([target], { timeoutMs }), /positive safe integer/);
  }
});
