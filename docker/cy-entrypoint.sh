#!/bin/sh
# 长缨在手控制台入口：全新数据目录首次启动时播种默认管理员凭据（admin / admin@2026），
# 之后交给用户自行修改。已存在 auth.json 时绝不覆盖。
if [ ! -f /data/.cy/agent/auth.json ] && [ -f /opt/cy-default-auth.json ]; then
	mkdir -p /data/.cy/agent
	cp /opt/cy-default-auth.json /data/.cy/agent/auth.json
	chmod 600 /data/.cy/agent/auth.json
	echo "[cy] 已播种默认管理员账号 admin（默认密码 admin@2026，请登录后尽快修改）"
fi
cd /app
exec node packages/web/dist/index.js --host 0.0.0.0 "$@"
