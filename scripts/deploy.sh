#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deploy the backend on the production server (DEV-WORKFLOW.md §6).
#
# Run ON THE SERVER (after `ssh azureuser@...`):
#     bash /opt/smarthealth-hub/scripts/deploy.sh
#
# What it does:
#   1. git pull (fast-forward only) on the current branch (normally main)
#   2. rebuilds + restarts the stack with GIT_COMMIT set, so the System Health
#      page shows exactly which commit is running
#   3. waits until every service is up / healthy and says if anything failed
#   4. after a successful deploy, deletes old Docker build cache and untagged
#      images (never volumes: database, photos and Redis data are untouched)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

compose() {
    docker compose -f docker-compose.server.yml --env-file .env.server "$@"
}

# Build cache newer than this is kept so the next deploy still builds quickly.
KEEP_BUILD_CACHE=72h

# Every rebuild leaves build cache and the previous (now untagged) backend
# image behind; without this the server disk fills up. Only runs after a
# successful deploy, and a failure here never fails the deploy.
cleanup() {
    echo "==> Freeing disk space (old build cache and untagged images)"
    docker image prune -f >/dev/null || echo "WARNING: could not remove old images."
    docker builder prune -f --filter "until=$KEEP_BUILD_CACHE" >/dev/null ||
        echo "WARNING: could not remove old build cache."
    df -h / | awk 'NR==2 {print "Disk: " $3 " used, " $4 " free (" $5 " used)"}'
}

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
    echo "WARNING: the server is on branch '$branch', not 'main'."
    read -r -p "Deploy '$branch' anyway? Type yes to continue: " answer
    if [ "$answer" != "yes" ]; then
        echo "Cancelled. To go back to main: git checkout main"
        exit 1
    fi
fi

echo "==> Pulling the latest code ($branch)"
git pull --ff-only

GIT_COMMIT=$(git rev-parse --short HEAD)
export GIT_COMMIT
echo "==> Building and starting commit $GIT_COMMIT (usually 1-3 minutes)"

if compose up -d --build --wait --wait-timeout 300; then
    compose ps
    echo
    cleanup
    echo
    echo "OK: commit $GIT_COMMIT is running."
    echo "Check it in the website: Settings > System Health (Version)."
else
    compose ps
    echo
    echo "FAILED: a service did not become healthy within 5 minutes."
    echo "Look at the logs:  dc logs --tail 50 backend"
    exit 1
fi
