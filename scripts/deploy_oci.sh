#!/usr/bin/env bash
# ==============================================================================
# deploy_oci.sh
# Automated deployment and systemd daemonization script for VEXO on Oracle Cloud
# ==============================================================================

set -euo pipefail

TARGET_HOST="oracle"
REMOTE_DIR="/home/ubuntu/vexo"

echo "🚀 Deploying VEXO to Oracle Cloud Infrastructure (${TARGET_HOST})..."

# 1. Ensure remote directory exists
ssh "${TARGET_HOST}" "mkdir -p ${REMOTE_DIR}"

# 2. Sync codebase to remote VM (excluding cache, legacy, node_modules)
echo "📦 Syncing codebase..."
rsync -avz --delete \
  --exclude="node_modules" \
  --exclude=".git" \
  --exclude=".venv" \
  --exclude="data" \
  --exclude="dist" \
  ./ "${TARGET_HOST}:${REMOTE_DIR}/"

# 3. Copy production .env if not exists
ssh "${TARGET_HOST}" "if [ ! -f ${REMOTE_DIR}/.env ]; then cp ${REMOTE_DIR}/.env.example ${REMOTE_DIR}/.env; fi"
scp .env "${TARGET_HOST}:${REMOTE_DIR}/.env"

# 4. Install production dependencies on ARM64 host
echo "📥 Installing npm packages on target..."
ssh "${TARGET_HOST}" "cd ${REMOTE_DIR} && npm install --omit=dev"

# 5. Configure systemd unit
echo "⚙️ Configuring systemd service (/etc/systemd/system/vexo.service)..."
ssh "${TARGET_HOST}" "sudo bash -c 'cat > /etc/systemd/system/vexo.service << \"EOF\"
[Unit]
Description=VEXO Discord Music Bot & VLC Stream
After=network.target ollama.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=${REMOTE_DIR}
ExecStart=/usr/bin/npx tsx src/index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable vexo.service
systemctl restart vexo.service
'"

echo "✅ VEXO successfully deployed and running under systemd on ${TARGET_HOST}!"
echo "📡 Check status with: ssh ${TARGET_HOST} 'systemctl status vexo'"
echo "📜 View logs with: ssh ${TARGET_HOST} 'journalctl -u vexo -f'"
