#!/usr/bin/env node
/**
 * Production build without Docker:  npm run build:prod
 *
 * 1. Runs `next build` with NEXT_PUBLIC_API_BASE_URL=/api/v1 so every browser
 *    request goes through this Next.js server (rewrites in next.config.ts
 *    proxy /api/v1/* and /media/* to FastAPI). Values in .env.local such as a
 *    LAN IP are only used by `npm run dev`. Override with PROD_API_BASE_URL.
 * 2. Copies .next/static and public/ next to the standalone server.js —
 *    `output: "standalone"` does not include them on its own.
 *
 * SERVER_SIDE_API_URL (where Next.js reaches FastAPI) is read as usual from
 * the environment or .env.local and baked into the rewrites at build time.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findStandaloneServer } from "./standalone-paths.mjs";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(appDir, "package.json"));

const env = {
  ...process.env,
  NEXT_PUBLIC_API_BASE_URL: process.env.PROD_API_BASE_URL ?? "/api/v1",
  NEXT_TELEMETRY_DISABLED: "1",
};

console.log(`[build:prod] NEXT_PUBLIC_API_BASE_URL=${env.NEXT_PUBLIC_API_BASE_URL}`);

const nextBin = require.resolve("next/dist/bin/next");
const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: appDir,
  env,
  stdio: "inherit",
});
if (result.status !== 0) {
  console.error("[build:prod] next build failed.");
  process.exit(result.status ?? 1);
}

const serverJs = findStandaloneServer(appDir);
if (!serverJs) {
  console.error(
    "[build:prod] .next/standalone/**/server.js not found — is output: \"standalone\" set in next.config.ts?"
  );
  process.exit(1);
}
const serverDir = dirname(serverJs);

const copies = [
  [join(appDir, ".next", "static"), join(serverDir, ".next", "static")],
  [join(appDir, "public"), join(serverDir, "public")],
];
for (const [from, to] of copies) {
  if (!existsSync(from)) continue;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

console.log(`[build:prod] Standalone server ready: ${serverJs}`);
console.log("[build:prod] Start it with: npm run start:prod");
