#!/usr/bin/env bash
# ==============================================================================
# OWRADIO - Caddy & DuckDNS Automated HTTPS Reverse Proxy Setup Script
# Works on Ubuntu 22.04 / 24.04 (ARM64 aarch64 & x86_64)
# ==============================================================================

set -euo pipefail

DOMAIN_INPUT="${1:-}"
DUCKDNS_TOKEN="${2:-}"

if [ -z "$DOMAIN_INPUT" ]; then
  echo "❌ Error: Domain or DuckDNS subdomain is required."
  echo "Usage: ./scripts/setup-caddy-duckdns.sh <domain_or_subdomain> [duckdns_token]"
  echo "Example DuckDNS: ./scripts/setup-caddy-duckdns.sh myradio a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  echo "Example Custom:  ./scripts/setup-caddy-duckdns.sh radio.mycommunity.com"
  exit 1
fi

if [ "$EUID" -ne 0 ]; then
  SUDO="sudo"
else
  SUDO=""
fi

# Normalize Domain
if [[ "$DOMAIN_INPUT" != *"."* ]]; then
  # Pure subdomain provided (e.g. "myradio") -> assume DuckDNS
  SUBDOMAIN="$DOMAIN_INPUT"
  FULL_DOMAIN="${DOMAIN_INPUT}.duckdns.org"
elif [[ "$DOMAIN_INPUT" == *".duckdns.org"* ]]; then
  SUBDOMAIN="${DOMAIN_INPUT%%.duckdns.org*}"
  FULL_DOMAIN="$DOMAIN_INPUT"
else
  # Custom domain (e.g. "radio.mycommunity.com")
  SUBDOMAIN=""
  FULL_DOMAIN="$DOMAIN_INPUT"
fi

echo "===================================================================="
echo "🔒 Configuring Caddy HTTPS Reverse Proxy for: https://${FULL_DOMAIN}"
echo "===================================================================="

# 1. Setup DuckDNS Dynamic DNS updater if token is provided
if [ -n "$DUCKDNS_TOKEN" ] && [ -n "$SUBDOMAIN" ]; then
  echo "🦆 [1/4] Configuring DuckDNS Dynamic DNS auto-updater..."
  
  # Immediate IP update ping
  RESP=$(curl -s "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=")
  if [ "$RESP" = "OK" ]; then
    echo "✅ DuckDNS updated successfully: ${SUBDOMAIN}.duckdns.org ➔ Current Public IP"
  else
    echo "⚠️ DuckDNS response: ${RESP} (Verify your subdomain and token if resolution fails)"
  fi

  # Install cron job to keep IP fresh every 5 minutes
  $SUDO bash -c "cat > /etc/cron.d/duckdns << EOF
*/5 * * * * root curl -s \"https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=\" >/dev/null 2>&1
EOF"
  $SUDO chmod 644 /etc/cron.d/duckdns
else
  echo "ℹ️ [1/4] Skipping DuckDNS updater (Custom domain or token not provided)."
fi

# 2. Install Caddy Web Server
echo "📦 [2/4] Verifying / Installing Caddy Web Server..."
if ! command -v caddy >/dev/null 2>&1; then
  echo "📥 Adding official Caddy repository..."
  $SUDO apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | $SUDO gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLF 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | $SUDO tee /etc/apt/sources.list.d/caddy-stable.list
  $SUDO apt-get update -y
  $SUDO apt-get install -y caddy
  echo "✅ Caddy installed successfully."
else
  echo "✅ Caddy $(caddy version | head -n1) is already installed."
fi

# 3. Configure /etc/caddy/Caddyfile
echo "⚙️ [3/4] Generating /etc/caddy/Caddyfile..."
$SUDO bash -c "cat > /etc/caddy/Caddyfile << EOF
${FULL_DOMAIN} {
    # Reverse proxy to OWRadio HTTP server
    reverse_proxy 127.0.0.1:8091 {
        # Instant unbuffered flush for live PCM stream and SSE events
        flush_interval -1
    }
}
EOF"

# 4. Open Host Firewall for Ports 80 & 443
echo "🛡️ [4/4] Ensuring ports 80 (HTTP) and 443 (HTTPS) are open..."
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  $SUDO ufw allow 80/tcp comment "HTTP (Caddy Let's Encrypt)" || true
  $SUDO ufw allow 443/tcp comment "HTTPS (Caddy SSL)" || true
fi

$SUDO iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
$SUDO iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
if command -v netfilter-persistent >/dev/null 2>&1; then
  $SUDO netfilter-persistent save || true
fi

# Enable and reload Caddy
$SUDO systemctl enable --now caddy
$SUDO systemctl reload caddy

# 5. Update PUBLIC_URL in local .env if present
if [ -f .env ]; then
  if grep -q "^PUBLIC_URL=" .env; then
    sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=https://${FULL_DOMAIN}|" .env
  else
    echo "PUBLIC_URL=https://${FULL_DOMAIN}" >> .env
  fi
  echo "📝 Updated PUBLIC_URL=https://${FULL_DOMAIN} in .env"
  
  # Restart OWRadio if systemd service is active
  if systemctl is-active --quiet owradio.service 2>/dev/null; then
    echo "🔄 Restarting owradio.service to apply new domain URL..."
    $SUDO systemctl restart owradio.service || true
  fi
fi

echo "===================================================================="
echo "🎉 HTTPS SETUP COMPLETE!"
echo "===================================================================="
echo "Your secure radio station is now live with automatic SSL:"
echo " - Dashboard: https://${FULL_DOMAIN}"
echo " - Stream:    https://${FULL_DOMAIN}/stream.mp3"
echo " - WebSocket/SSE: https://${FULL_DOMAIN}/api/events"
echo ""
echo "Note: If your browser says 'Site cannot be reached', make sure"
echo "TCP ports 80 and 443 are added to your Oracle Cloud VCN Security List!"
echo "===================================================================="
