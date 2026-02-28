#!/bin/bash
set -e

echo "=== Al-Mowlada Deployment Script ==="
echo "Target: almolda.com"
echo ""

cd "$(dirname "$0")/.."

echo "[1/4] Pulling latest code..."
git pull || echo "Git pull skipped (not a git repo or no remote)"

echo "[2/4] Installing dependencies..."
npm install

echo "[3/4] Building server..."
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=server_dist

echo "[4/4] Pushing database schema..."
npx drizzle-kit push

echo ""
echo "=== Build Complete ==="
echo ""
echo "Starting/Restarting server..."
if command -v pm2 &> /dev/null; then
  pm2 restart almolda 2>/dev/null || pm2 start server_dist/index.js --name almolda
  echo "Server started with PM2"
else
  echo "PM2 not found. Start manually with:"
  echo "  NODE_ENV=production node server_dist/index.js"
fi

echo ""
echo "=== Deployment Complete ==="
