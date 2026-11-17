import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Locate the standalone server.js emitted by `next build`.
 *
 * In this pnpm monorepo Next traces files from the workspace root, so the
 * server lands at .next/standalone/frontend/web/server.js. In an isolated
 * build (e.g. the Docker image) it is .next/standalone/server.js.
 */
export function findStandaloneServer(appDir) {
  const candidates = [
    join(appDir, ".next", "standalone", "frontend", "web", "server.js"),
    join(appDir, ".next", "standalone", "server.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}
