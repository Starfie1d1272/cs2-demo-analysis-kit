import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { planVersionSync, applyVersionSync } from "./sync-version.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "dak-version-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    "package.json": JSON.stringify({ private: true, version: "0.8.2" }) + "\n",
    "apps/studio/package.json": JSON.stringify({ private: true, version: "0.8.2" }) + "\n",
    "packages/public/package.json": JSON.stringify({ version: "1.2.3" }) + "\n",
    "python/src/cs2dak/__init__.py": '__version__ = "0.8.2"\n',
    "python/pyproject.toml": '[project]\nname = "cs2dak"\nversion = "0.8.2"\n\n[tool.other]\nversion = "9.9.9"\n',
    "python/uv.lock": 'version = 1\n\n[[package]]\nname = "cs2dak"\nversion = "0.8.2"\n\n[[package]]\nname = "dependency"\nversion = "9.9.9"\n',
  };
  for (const [rel, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), source);
  }
  return { root, files, snapshot: () => Object.fromEntries(Object.keys(files).map((rel) => [rel, readFileSync(join(root, rel), "utf8")])) };
}

test("canonical version updates all private/Python targets, preserves public and other blocks", (t) => {
  const f = fixture(t);
  const edits = planVersionSync(f.root, "0.8.3");
  assert.equal(edits.length, 5);
  assert.deepEqual(f.snapshot(), f.files); // Planning is read-only.
  applyVersionSync(edits);
  const after = f.snapshot();
  assert.equal(JSON.parse(after["package.json"]).version, "0.8.3");
  assert.equal(JSON.parse(after["apps/studio/package.json"]).version, "0.8.3");
  assert.equal(after["packages/public/package.json"], f.files["packages/public/package.json"]);
  assert.match(after["python/src/cs2dak/__init__.py"], /0\.8\.3/);
  assert.match(after["python/pyproject.toml"], /version = "0\.8\.3"/);
  assert.match(after["python/pyproject.toml"], /\[tool.other\]\nversion = "9\.9\.9"/);
  assert.match(after["python/uv.lock"], /name = "cs2dak"\nversion = "0\.8\.3"/);
  assert.match(after["python/uv.lock"], /name = "dependency"\nversion = "9\.9\.9"/);
  assert.deepEqual(planVersionSync(f.root, "0.8.3"), []);
});

for (const version of ["invalid", "0.8.3-dev.3a3307b", "0.8.3+sha", "01.2.3", "0.8.3trailing", "0.8.3\n"]) {
  test(`invalid input ${JSON.stringify(version)} changes no files`, (t) => {
    const f = fixture(t);
    assert.throws(() => planVersionSync(f.root, version), /non-canonical/);
    assert.deepEqual(f.snapshot(), f.files);
  });
}

test("repairs a malformed current cs2dak version without touching dependency versions", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, "python/uv.lock"), f.files["python/uv.lock"].replace('version = "0.8.2"', 'version = "0.8.3-dev.bad"'));
  applyVersionSync(planVersionSync(f.root, "0.8.3"));
  assert.match(f.snapshot()["python/uv.lock"], /name = "cs2dak"\nversion = "0\.8\.3"/);
  assert.match(f.snapshot()["python/uv.lock"], /name = "dependency"\nversion = "9\.9\.9"/);
});

for (const broken of ["missing project version", "duplicate lock package", "missing Python target", "invalid manifest"]) {
  test(`late validation failure ${broken} leaves all existing bytes unchanged`, (t) => {
    const f = fixture(t);
    const lock = join(f.root, "python/uv.lock");
    if (broken === "missing project version") writeFileSync(join(f.root, "python/pyproject.toml"), '[project]\nname = "cs2dak"\n');
    if (broken === "duplicate lock package") writeFileSync(lock, f.files["python/uv.lock"] + '\n[[package]]\nname = "cs2dak"\nversion = "0.8.2"\n');
    if (broken === "invalid manifest") writeFileSync(join(f.root, "apps/studio/package.json"), "invalid");
    if (broken === "missing Python target") { rmSync(lock); delete f.files["python/uv.lock"]; }
    const before = f.snapshot();
    assert.throws(() => planVersionSync(f.root, "0.8.3"));
    assert.deepEqual(f.snapshot(), before);
  });
}

test("mid-write failure restores prior and partially written targets", (t) => {
  const f = fixture(t);
  let calls = 0;
  assert.throws(() => applyVersionSync(planVersionSync(f.root, "0.8.3"), (path, source) => {
    if (++calls === 3) { writeFileSync(path, "partial"); throw new Error("injected write failure"); }
    writeFileSync(path, source);
  }), /injected write failure/);
  assert.deepEqual(f.snapshot(), f.files);
});

test("rollback failures preserve both failures for the operator", (t) => {
  const f = fixture(t);
  assert.throws(() => applyVersionSync(planVersionSync(f.root, "0.8.3"), () => { throw new Error("write unavailable"); }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.match(error.message, /could not be restored/);
    return true;
  });
  assert.deepEqual(f.snapshot(), f.files);
});
