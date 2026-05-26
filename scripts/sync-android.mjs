#!/usr/bin/env node
// Copies the Vite build output (dist/) into the Android app's WebView assets so the
// embedded 3D viewer always matches the current web source. Run after `vite build`
// (or use `npm run build:android`, which does both).
//
// Target dir resolution order:
//   1. ANDROID_ASSETS_DIR env var
//   2. first CLI argument
//   3. ../almacenDigital-Android/app/src/main/assets (default: repos side by side)

import { existsSync, rmSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const distDir = resolve(repoRoot, "dist");

const targetDir =
  process.env.ANDROID_ASSETS_DIR ||
  process.argv[2] ||
  resolve(repoRoot, "..", "almacenDigital-Android", "app", "src", "main", "assets");

function fail(message) {
  console.error(`\n[sync-android] ${message}\n`);
  process.exit(1);
}

if (!existsSync(distDir) || readdirSync(distDir).length === 0) {
  fail('No build found in dist/. Run "npm run build" first (or use "npm run build:android").');
}

const targetParent = resolve(targetDir, "..");
if (!existsSync(targetParent)) {
  fail(
    `Android assets parent not found:\n  ${targetParent}\n` +
      "Place both repos side by side, or pass the path explicitly:\n" +
      "  npm run sync:android -- /path/to/almacenDigital-Android/app/src/main/assets\n" +
      "  ANDROID_ASSETS_DIR=/path/... npm run sync:android"
  );
}

// Preserve any non-web assets the app ships (e.g. warehouse-config.json) by only
// removing the generated web entrypoints, then copying the fresh build over them.
// `uploads/` is excluded: product images are served by the backend at runtime, so
// bundling them would bloat the APK and go stale.
for (const entry of ["assets", "index.html", "favicon.svg", "uploads"]) {
  rmSync(resolve(targetDir, entry), { recursive: true, force: true });
}
mkdirSync(targetDir, { recursive: true });

const uploadsDir = resolve(distDir, "uploads");
cpSync(distDir, targetDir, {
  recursive: true,
  filter: (src) => src !== uploadsDir && !src.startsWith(uploadsDir + sep)
});

const copied = readdirSync(resolve(targetDir, "assets"));
console.log(`[sync-android] Synced ${copied.length} asset file(s) -> ${targetDir}`);
