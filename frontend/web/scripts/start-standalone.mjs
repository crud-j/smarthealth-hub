#!/usr/bin/env node
/**
 * Start the production server built by `npm run build:prod`:  npm run start:prod
 *
 * Loads runtime env vars (e.g. SERVER_SIDE_API_URL for server-side fetches)
 * from this folder's .env files — the standalone folder has no copy of them —
 * without overriding variables already set in the shell. Defaults to
 * PORT=3000 and HOSTNAME=0.0.0.0.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { findStandaloneServer } from "./standalone-paths.mjs";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// Same precedence as Next.js: earlier files win, the shell beats all files.
for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const file = join(appDir, name);
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

process.env.NODE_ENV = "production";
process.env.PORT ??= "3000";
process.env.HOSTNAME ??= "0.0.0.0";

const serverJs = findStandaloneServer(appDir);
if (!serverJs) {
  console.error("[start:prod] No production build found. Run `npm run build:prod` first.");
  process.exit(1);
}
if (!existsSync(join(dirname(serverJs), ".next", "static"))) {
  console.error("[start:prod] Static assets missing next to server.js. Re-run `npm run build:prod`.");
  process.exit(1);
}

console.log(`[start:prod] http://${process.env.HOSTNAME}:${process.env.PORT}  (${serverJs})`);
await import(pathToFileURL(serverJs).href);
