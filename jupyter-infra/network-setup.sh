#!/usr/bin/env bash
# =============================================================================
# network-setup.sh
#
# Run once on the host to:
#   1. Create the jhub-users Docker network (ICC (Inter-Container Communication) disabled)
#   2. Install iptables rules that allow container egress to your portal
#      API only — everything else is dropped.
#
# Re-run after reboots, or install as a systemd service (see bottom).
# Requires: docker, iptables, ipset, iptables-persistent
# =============================================================================
set -euo pipefail

# cSpell:disable

SUBNET="172.20.0.0/16"
# Kernel network interface names are limited to 15 characters on most systems.
# Use a short default bridge name to avoid "numerical result out of range" errors
# (can still be overridden by setting the BRIDGE_NAME env var before running).
BRIDGE_NAME="${BRIDGE_NAME:-jhub-users}"
# PORTAL_HOST="${PORTAL_HOST:-research-portal.com}"   # override via env if needed

# =============================================================================
# 1. Docker network
# =============================================================================
echo "→ Setting up Docker network..."

if docker network inspect "$BRIDGE_NAME" &>/dev/null; then
    echo "  Network '$BRIDGE_NAME' already exists — skipping creation."
    echo "  NOTE: ICC and subnet settings cannot be changed on an existing network."
    echo "  To recreate: docker network rm $BRIDGE_NAME && run this script again."
else
    docker network create \
        --driver bridge \
        --subnet "$SUBNET" \
        --opt "com.docker.network.bridge.name=${BRIDGE_NAME}" \
        --opt "com.docker.network.bridge.enable_icc=false" \
        --opt "com.docker.network.bridge.enable_ip_masquerade=true" \
        "$BRIDGE_NAME"
    echo "  Created network '$BRIDGE_NAME' (ICC disabled)."
fi

# =============================================================================
# 2. ipset: portal IPs (refreshed by cron job below)
# =============================================================================
# echo "→ Configuring ipset for portal IPs..."

# if ! ipset list portal-hosts &>/dev/null; then
#     ipset create portal-hosts hash:ip comment
# fi

# ipset flush portal-hosts

# # Resolve and populate
# PORTAL_IPS=$(dig +short "$PORTAL_HOST" | grep -E '^[0-9]+\.' || true)
# if [[ -z "$PORTAL_IPS" ]]; then
#     echo "  WARNING: Could not resolve $PORTAL_HOST — no IPs added to ipset."
#     echo "  Containers will have no egress until IPs are resolved."
# else
#     while IFS= read -r ip; do
#         ipset add portal-hosts "$ip" comment "resolved $(date +%Y-%m-%dT%H:%M:%S)"
#         echo "  Added $ip ($PORTAL_HOST)"
#     done <<< "$PORTAL_IPS"
# fi

# # =============================================================================
# # 3. iptables rules
# # =============================================================================
# echo "→ Installing iptables rules..."

# # Helper: insert rule only if it doesn't already exist
# ipt_insert() {
#     if ! iptables -C "$@" 2>/dev/null; then
#         iptables -I "$@"
#     fi
# }

# # --- Allow established/related return traffic (must be first / highest priority) ---
# ipt_insert FORWARD \
#     -m conntrack --ctstate ESTABLISHED,RELATED \
#     -j ACCEPT

# # --- Allow container → Hub gateway (required for Jupyter ↔ Hub communication) ---
# GATEWAY_IP=$(docker network inspect "$BRIDGE_NAME" \
#     --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
# ipt_insert FORWARD \
#     -s "$SUBNET" -d "$GATEWAY_IP/32" \
#     -j ACCEPT
# echo "  Hub gateway: $GATEWAY_IP"

# # --- Allow container → Portal API (HTTPS only) ---
# ipt_insert FORWARD \
#     -s "$SUBNET" \
#     -m set --match-set portal-hosts dst \
#     -p tcp --dport 443 \
#     -j ACCEPT

# # --- DROP everything else from the container subnet ---
# # This catches: internet egress, PyPI, inter-subnet traffic, etc.
# ipt_insert FORWARD \
#     -s "$SUBNET" \
#     -j DROP

# echo "  iptables rules installed."

# # =============================================================================
# # 4. Persist rules
# # =============================================================================
# echo "→ Persisting iptables rules..."
# if command -v netfilter-persistent &>/dev/null; then
#     netfilter-persistent save
#     echo "  Saved via netfilter-persistent."
# elif command -v iptables-save &>/dev/null; then
#     iptables-save > /etc/iptables/rules.v4
#     echo "  Saved to /etc/iptables/rules.v4."
# fi

# echo ""
# echo "✓ Network setup complete."
# echo ""
# echo "Next steps:"
# echo "  1. Install the cron job to refresh portal IPs:"
# echo "     crontab -e  →  */5 * * * * /usr/local/bin/refresh-portal-ipset.sh"
# echo "  2. Verify with: docker run --rm --network $BRIDGE_NAME alpine/curl curl -I https://$PORTAL_HOST"
# echo "  3. Verify block: docker run --rm --network $BRIDGE_NAME alpine/curl curl -I https://google.com"

# # =============================================================================
# # Cron script for dynamic IP refresh
# # Install to: /usr/local/bin/refresh-portal-ipset.sh
# # =============================================================================
# cat > /usr/local/bin/refresh-portal-ipset.sh << 'CRONSCRIPT'
# #!/usr/bin/env bash
# # Refreshes portal-hosts ipset with current DNS resolution.
# # Runs every 5 minutes via cron.
# set -euo pipefail
# PORTAL_HOST="${PORTAL_HOST:-research-portal.com}"

# NEW_IPS=$(dig +short "$PORTAL_HOST" | grep -E '^[0-9]+\.' || true)
# [[ -z "$NEW_IPS" ]] && exit 0   # don't flush if DNS fails

# # Swap atomically using a temp set
# ipset create portal-hosts-tmp hash:ip comment 2>/dev/null || ipset flush portal-hosts-tmp
# while IFS= read -r ip; do
#     ipset add portal-hosts-tmp "$ip" comment "$(date +%Y-%m-%dT%H:%M:%S)"
# done <<< "$NEW_IPS"
# ipset swap portal-hosts-tmp portal-hosts
# ipset destroy portal-hosts-tmp
# CRONSCRIPT

# chmod +x /usr/local/bin/refresh-portal-ipset.sh
# echo "  Installed /usr/local/bin/refresh-portal-ipset.sh"
# echo "  Add to cron: */5 * * * * /usr/local/bin/refresh-portal-ipset.sh"
