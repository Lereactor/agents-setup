#!/usr/bin/env bash
# Caddyfile для marketplace-mcp: HTTPS на 193-233-84-69.sslip.io (Let's Encrypt),
# открыт только секретный путь /<PUBLIC_PATH_SECRET>/mcp → 127.0.0.1:8765,
# всё остальное — 404. Ключи MCP подставляет Caddy (коннектор claude.ai
# произвольные заголовки передавать не умеет). Секреты — из /etc/marketplace-mcp.env.
set -e
. /etc/marketplace-mcp.env
cat > /etc/caddy/Caddyfile <<EOF
{
	email lev@alaev.fr
	servers {
		timeouts {
			read_header 10s
			idle 2m
		}
	}
}

193-233-84-69.sslip.io {
	header {
		-Server
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy no-referrer
	}
	request_body {
		max_size 256KB
	}
	handle /${PUBLIC_PATH_SECRET}/mcp* {
		uri strip_prefix /${PUBLIC_PATH_SECRET}
		reverse_proxy 127.0.0.1:8765 {
			header_up Authorization "Bearer ${MCP_HTTP_AUTH_TOKEN}"
			header_up X-MCP-Tenant "${MCP_HTTP_TENANT_ID}"
		}
	}
	handle {
		respond 404
	}
	log {
		output file /var/log/caddy/access.log {
			roll_size 5MiB
			roll_keep 3
		}
	}
}
EOF
chmod 640 /etc/caddy/Caddyfile
chown root:caddy /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy
echo CONFIG_DONE
