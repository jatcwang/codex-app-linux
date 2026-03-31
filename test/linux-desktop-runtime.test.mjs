import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { findLatestCachedBinaryPath } from "../runtime/lib/linux-desktop.mjs";

test("findLatestCachedBinaryPath picks newest executable from cache", async () => {
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-app-linux-cache-"));
  const olderDir = path.join(cacheRoot, "codex-app-linux", "26.0.0", "linux-unpacked");
  const newerDir = path.join(cacheRoot, "codex-app-linux", "27.0.0", "linux-unpacked");
  const olderBinary = path.join(olderDir, "codex-app-linux");
  const newerBinary = path.join(newerDir, "codex-app-linux-beta");

  await fs.mkdir(olderDir, { recursive: true });
  await fs.mkdir(newerDir, { recursive: true });
  await fs.writeFile(olderBinary, "", { mode: 0o755 });
  await fs.writeFile(newerBinary, "", { mode: 0o755 });

  const oldTime = new Date("2026-03-01T00:00:00Z");
  const newTime = new Date("2026-03-02T00:00:00Z");
  await fs.utimes(olderBinary, oldTime, oldTime);
  await fs.utimes(newerBinary, newTime, newTime);

  const resolved = await findLatestCachedBinaryPath({
    env: {
      ...process.env,
      XDG_CACHE_HOME: cacheRoot
    }
  });

  assert.equal(resolved, newerBinary);
});
