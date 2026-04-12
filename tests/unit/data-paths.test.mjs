import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;

function importFreshDataPaths(tag) {
  return import(`../../src/lib/dataPaths.ts?case=${tag}-${Date.now()}`);
}

test.afterEach(() => {
  if (ORIGINAL_DATA_DIR === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  }

  if (ORIGINAL_XDG_CONFIG_HOME === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = ORIGINAL_XDG_CONFIG_HOME;
  }
});

test("resolveDataDir returns configured DATA_DIR when it is writable", async () => {
  const writableDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-data-paths-writable-"));
  process.env.DATA_DIR = writableDir;

  const { resolveDataDir } = await importFreshDataPaths("writable");

  assert.equal(resolveDataDir(), writableDir);
});

test("resolveDataDir falls back to tmp when configured and default data dirs are blocked by files", async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-data-paths-blocked-"));
  const blockedDataDir = path.join(testRoot, "blocked-data-dir");
  const blockedXdgHome = path.join(testRoot, "blocked-xdg-home");
  fs.writeFileSync(blockedDataDir, "not-a-directory");
  fs.writeFileSync(blockedXdgHome, "not-a-directory");
  process.env.DATA_DIR = blockedDataDir;
  process.env.XDG_CONFIG_HOME = blockedXdgHome;

  const { APP_NAME, resolveDataDir } = await importFreshDataPaths("blocked");
  const resolved = resolveDataDir();

  assert.notEqual(resolved, blockedDataDir);
  assert.equal(resolved, path.join(os.tmpdir(), APP_NAME));
});
