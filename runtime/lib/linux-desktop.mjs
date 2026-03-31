import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export function defaultPackageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export async function readInstalledPackage(packageRoot = defaultPackageRoot()) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, "utf8"));
  const metadata = packageJson.codexAppLinux;

  if (!metadata) {
    throw new Error(`Missing codexAppLinux metadata in ${packageJsonPath}`);
  }

  return {
    packageRoot,
    packageJson,
    metadata
  };
}

export async function tryReadInstalledPackage(packageRoot = defaultPackageRoot()) {
  try {
    return await readInstalledPackage(packageRoot);
  } catch {
    return null;
  }
}

export function isExecutable(candidate) {
  if (!candidate) {
    return false;
  }

  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveCodexCliPath({ env = process.env, preferredPath } = {}) {
  if (isExecutable(env.CODEX_CLI_PATH)) {
    return env.CODEX_CLI_PATH;
  }

  if (isExecutable(preferredPath)) {
    return preferredPath;
  }

  const result = spawnSync("which", ["codex"], {
    encoding: "utf8"
  });
  const candidate = result.status === 0 ? result.stdout.trim() : "";

  if (isExecutable(candidate)) {
    return candidate;
  }

  return null;
}

export function cacheDirForPackage({ env = process.env, packageName, packageVersion }) {
  const cacheRoot =
    env.CODEX_APP_LINUX_CACHE_DIR ||
    env.XDG_CACHE_HOME ||
    path.join(os.homedir(), ".cache");

  return path.join(cacheRoot, packageName, packageVersion);
}

export function resolveCacheRoot(env = process.env) {
  return (
    env.CODEX_APP_LINUX_CACHE_DIR ||
    env.XDG_CACHE_HOME ||
    path.join(os.homedir(), ".cache")
  );
}

export function resolveBundlePathsFromBinary(binaryPath) {
  const appPath = path.dirname(path.resolve(binaryPath));
  const resourcesPath = path.join(appPath, "resources");

  return {
    appPath,
    resourcesPath,
    asarPath: path.join(resourcesPath, "app.asar"),
    packageMetadataPath: path.join(resourcesPath, "app-package.json"),
    codexCliPath: path.join(resourcesPath, "codex"),
    binaryPath: path.resolve(binaryPath)
  };
}

export async function resolveBinaryPath({
  packageJson,
  metadata = packageJson?.codexAppLinux,
  env = process.env
}) {
  if (!packageJson || !metadata) {
    throw new Error("resolveBinaryPath requires packageJson with codexAppLinux metadata");
  }

  const overridePath = env.CODEX_APP_LINUX_BINARY_PATH;

  if (isExecutable(overridePath)) {
    return overridePath;
  }

  const cacheDir = cacheDirForPackage({
    env,
    packageName: packageJson.name,
    packageVersion: packageJson.version
  });
  const archivePath = path.join(cacheDir, metadata.unpackedTarballAssetName);
  const extractRoot = path.join(cacheDir, "linux-unpacked");
  const binaryPath = path.join(extractRoot, metadata.executableName);

  await fsp.mkdir(cacheDir, { recursive: true });

  if (
    isExecutable(binaryPath) &&
    (await matchesChecksum(archivePath, metadata.unpackedTarballSha256))
  ) {
    return binaryPath;
  }

  const downloadUrl = env.CODEX_APP_LINUX_RELEASE_BASE_URL
    ? joinUrl(env.CODEX_APP_LINUX_RELEASE_BASE_URL, metadata.unpackedTarballAssetName)
    : `https://github.com/${metadata.releaseRepo}/releases/download/${metadata.releaseTag}/${metadata.unpackedTarballAssetName}`;

  process.stderr.write(`codex-app-linux: downloading ${metadata.unpackedTarballAssetName}\n`);

  const tempPath = `${archivePath}.download`;
  const response = await fetch(downloadUrl);

  if (!response.ok || !response.body) {
    throw new Error(
      `failed to download desktop binary archive: ${response.status} ${response.statusText}`
    );
  }

  await pipeline(response.body, createWriteStream(tempPath));

  if (!(await matchesChecksum(tempPath, metadata.unpackedTarballSha256))) {
    await fsp.rm(tempPath, { force: true });
    throw new Error("downloaded desktop binary archive checksum mismatch");
  }

  await fsp.rename(tempPath, archivePath);
  await fsp.rm(extractRoot, { recursive: true, force: true });
  await extractTarball(archivePath, cacheDir);

  if (!isExecutable(binaryPath)) {
    throw new Error(`downloaded archive did not contain executable ${metadata.executableName}`);
  }

  return binaryPath;
}

export async function findLatestCachedBinaryPath({
  env = process.env,
  packageNames = ["codex-app-linux"]
} = {}) {
  const cacheRoot = resolveCacheRoot(env);
  const candidates = [];

  for (const packageName of packageNames) {
    const packageRoot = path.join(cacheRoot, packageName);
    const versions = await fsp.readdir(packageRoot, { withFileTypes: true }).catch(() => []);

    for (const versionEntry of versions) {
      if (!versionEntry.isDirectory()) {
        continue;
      }

      const linuxDir = path.join(packageRoot, versionEntry.name, "linux-unpacked");
      const entries = await fsp.readdir(linuxDir, { withFileTypes: true }).catch(() => []);

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        if (!entry.name.startsWith("codex-app-linux")) {
          continue;
        }

        const binaryPath = path.join(linuxDir, entry.name);
        if (!isExecutable(binaryPath)) {
          continue;
        }

        const stat = await fsp.stat(binaryPath).catch(() => null);
        if (!stat) {
          continue;
        }

        candidates.push({
          binaryPath,
          mtimeMs: stat.mtimeMs
        });
      }
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.binaryPath || null;
}

export async function matchesChecksum(filePath, expected) {
  if (!expected) {
    return isExecutable(filePath);
  }

  try {
    const hash = crypto.createHash("sha256");
    const file = await fsp.readFile(filePath);
    hash.update(file);
    return hash.digest("hex") === expected;
  } catch {
    return false;
  }
}

export function joinUrl(base, assetName) {
  return `${String(base).replace(/\/$/, "")}/${assetName}`;
}

export async function extractTarball(archivePath, targetDir) {
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xzf", archivePath, "-C", targetDir], {
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`tar extraction failed: ${code}`));
    });
  });
}
