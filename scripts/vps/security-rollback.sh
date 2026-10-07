#!/usr/bin/env bash
# Откат усиления защиты VPS (193.233.84.69), сделанного 2026-10-07:
#   sudo bash /root/security-rollback.sh
# Снимает: fail2ban, вход SSH только по ключу (drop-in), firewall ufw.
# Возвращает состояние из снимка /root/pre-marketplace-snapshot (ufw был
# inactive, root мог входить по паролю). vtb-monitor не трогает.
# Пробный marketplace-mcp + Caddy уже удалены 2026-10-07 — их здесь нет.
set -u
S=/root/pre-marketplace-snapshot
[ -d "$S" ] || { echo "нет снимка $S"; exit 1; }

if ! grep -qx fail2ban "$S/packages.txt"; then
  systemctl disable --now fail2ban.service 2>/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get purge -y fail2ban python3-pyasyncore python3-pyinotify whois >/dev/null 2>&1
  rm -rf /etc/fail2ban
fi

rm -f /etc/ssh/sshd_config.d/00-hardening.conf
sshd -t && systemctl reload ssh

grep -q "Status: inactive" "$S/ufw.txt" && ufw --force disable >/dev/null
rm -rf /etc/ufw && cp -a "$S/ufw-etc" /etc/ufw

echo "ufw: $(ufw status | head -1)"
sshd -T | grep -E "^(passwordauthentication|permitrootlogin) "
systemctl is-active vtb-monitor.timer vtb-channel.timer
echo "Откат защиты завершён."
