#!/usr/bin/env bash
# Полный откат установки marketplace-mcp на VPS (193.233.84.69) к состоянию
# до 2026-10-07: снимок в /root/pre-marketplace-snapshot.
#
#   sudo bash /root/marketplace-rollback.sh
#
# Удаляет: сервис marketplace-mcp, пользователя mktmcp, /opt/marketplace-mcp,
# Caddy (пакет, репозиторий, ключ, конфиг, данные), fail2ban (если его не было
# до установки), drop-in усиления SSH, правила ufw (возвращает ufw в прежнее
# состояние: на момент снимка — inactive). vtb-monitor не трогает.
set -u
S=/root/pre-marketplace-snapshot
[ -d "$S" ] || { echo "нет снимка $S — откат невозможен"; exit 1; }

echo "== marketplace-mcp"
systemctl disable --now marketplace-mcp.service 2>/dev/null
rm -f /etc/systemd/system/marketplace-mcp.service
rm -rf /opt/marketplace-mcp /etc/marketplace-mcp.env
id mktmcp >/dev/null 2>&1 && userdel mktmcp

echo "== caddy"
if ! grep -qx caddy "$S/packages.txt"; then
  systemctl disable --now caddy.service 2>/dev/null
  apt-get purge -y caddy >/dev/null 2>&1
  rm -rf /etc/caddy /var/lib/caddy /var/log/caddy
  id caddy >/dev/null 2>&1 && userdel caddy
fi
grep -qx caddy-stable-stable.list "$S/apt-sources.txt" 2>/dev/null || rm -f /etc/apt/sources.list.d/caddy-stable*.list
rm -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg

echo "== fail2ban"
if ! grep -qx fail2ban "$S/packages.txt"; then
  systemctl disable --now fail2ban.service 2>/dev/null
  apt-get purge -y fail2ban >/dev/null 2>&1
  rm -rf /etc/fail2ban
fi

echo "== ssh"
rm -f /etc/ssh/sshd_config.d/00-hardening.conf
sshd -t && systemctl reload ssh

echo "== ufw"
if grep -q "Status: inactive" "$S/ufw.txt"; then
  ufw --force disable >/dev/null
fi
rm -rf /etc/ufw && cp -a "$S/ufw-etc" /etc/ufw

systemctl daemon-reload
apt-get autoremove -y >/dev/null 2>&1

echo "== проверка"
echo "-- слушают сейчас:"; ss -tlnp | sed 1d | awk '{print $4}'
echo "-- было:";           sed 1d "$S/listening.txt" | awk '{print $4}'
echo "-- ufw:"; ufw status | head -1
echo "-- новые пакеты относительно снимка:"
comm -13 "$S/packages.txt" <(dpkg-query -W -f='${Package}\n' | sort)
echo "-- vtb-monitor:"; systemctl is-active vtb-monitor.timer vtb-channel.timer
echo "Откат завершён."
