#!/usr/bin/env bash
# ==============================================================================
# rollback-to-legacy.sh
# Instant 1-click fallback from OWRadio back to legacy Python bot on vexo
# ==============================================================================
set -euo pipefail

cd /opt/vexo

echo "⏮️ [1/3] Restoring legacy bot compose configurations..."
if [ ! -f docker-compose.legacy.yml ] || [ ! -f docker-compose.vps.legacy.yml ]; then
  echo "❌ Error: Legacy compose backup files not found in /opt/vexo!" >&2
  exit 1
fi

cp docker-compose.legacy.yml docker-compose.yml
cp docker-compose.vps.legacy.yml docker-compose.vps.yml

if [ -f data/youtube-cookies.legacy.txt ]; then
  cp data/youtube-cookies.legacy.txt data/youtube-cookies.txt
  echo "  ✅ Restored legacy cookies"
fi

echo "🏗️ [2/3] Rebuilding & starting legacy Python bot..."
sudo /usr/local/sbin/musicbot-control rebuild

echo "🔍 [3/3] Checking legacy bot status..."
sudo /usr/local/sbin/musicbot-control status

echo "===================================================================="
echo "✅ Legacy Python Music Bot has been restored!"
echo "===================================================================="
