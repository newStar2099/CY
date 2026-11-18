#!/usr/bin/env bash
# Package the already-built daemon into the two jailbreak layouts.
#
#   scripts/build-deb.sh                # both
#   scripts/build-deb.sh rootful
#   scripts/build-deb.sh rootless
#
# Uses dpkg-deb when present, otherwise scripts/debpack.py (pure Python ar+tar),
# so a plain macOS host can still produce the two packages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${VERSION:-0.1.8}"
BIN="${BIN:-$ROOT/build/cybridged}"
OUT="${OUT:-$ROOT/build}"
LABEL="com.zgsfsec.cybridged"
WATCH_LABEL="com.zgsfsec.cybridgewatchdog"

if [ ! -f "$BIN" ]; then
	echo "error: 找不到 $BIN；先运行 scripts/build-ios.sh" >&2
	exit 1
fi
PACKER=""
if command -v dpkg-deb >/dev/null 2>&1; then
	PACKER="dpkg-deb"
elif command -v python3 >/dev/null 2>&1 && [ -f "$ROOT/scripts/debpack.py" ]; then
	PACKER="debpack"
else
	echo "error: 需要 dpkg-deb 或 python3（scripts/debpack.py）才能打包" >&2
	exit 1
fi

if [ "$#" -eq 0 ]; then
	FORMS=(rootful rootless)
else
	FORMS=("$@")
fi

for FORM in "${FORMS[@]}"; do
	case "$FORM" in
	rootful)
		ARCH="iphoneos-arm"
		MIN="14.0"
		BIN_DIR="usr/bin"
		PLIST_DIR="Library/LaunchDaemons"
		CONFIG_DIR="etc"
		SHARE_DIR="usr/share/cybridge"
		STATE_DIR="/var/lib/cybridge"
		PREFIX=""
		;;
	rootless)
		ARCH="iphoneos-arm64"
		MIN="15.0"
		BIN_DIR="var/jb/usr/bin"
		PLIST_DIR="var/jb/Library/LaunchDaemons"
		CONFIG_DIR="var/jb/etc"
		SHARE_DIR="var/jb/usr/share/cybridge"
		STATE_DIR="/var/jb/var/lib/cybridge"
		PREFIX="/var/jb"
		;;
	*)
		echo "error: 未知变体 $FORM（rootful 或 rootless）" >&2
		exit 2
		;;
	esac

	STAGE="$OUT/deb-$FORM"
	rm -rf "$STAGE"
	mkdir -p "$STAGE/DEBIAN" "$STAGE/$BIN_DIR" "$STAGE/$PLIST_DIR" "$STAGE/$SHARE_DIR"
	install -m 755 "$BIN" "$STAGE/$BIN_DIR/cybridged"
	install -m 644 debian/config.example.json "$STAGE/$SHARE_DIR/config.example.json"

	PLIST="$PREFIX/Library/LaunchDaemons/$LABEL.plist"
	WATCH_PLIST="$PREFIX/Library/LaunchDaemons/$WATCH_LABEL.plist"
	CONFIG="$PREFIX/etc/cybridge.json"
	EXAMPLE="$PREFIX/usr/share/cybridge/config.example.json"
	BIN_PATH="$PREFIX/usr/bin/cybridged"
	WATCHDOG_PATH="$PREFIX/usr/bin/cybridge-watchdog"
	LOG="/var/log/cybridge.log"
	WATCH_LOG="/var/log/cybridge-watchdog.log"

	sed -e "s|@BIN@|$BIN_PATH|g" -e "s|@CONFIG@|$CONFIG|g" -e "s|@LOG@|$LOG|g" \
		debian/launchd.plist.in > "$STAGE/$PLIST_DIR/$LABEL.plist"
	sed -e "1s|^#!/bin/sh|#!$PREFIX/bin/sh|" -e "s|@HEARTBEAT@|$STATE_DIR/watchdog-heartbeat|g" \
		debian/watchdog.sh.in > "$STAGE/$BIN_DIR/cybridge-watchdog"
	chmod 755 "$STAGE/$BIN_DIR/cybridge-watchdog"
	sed -e "s|@WATCHDOG@|$WATCHDOG_PATH|g" -e "s|@WLOG@|$WATCH_LOG|g" \
		debian/launchd-watchdog.plist.in > "$STAGE/$PLIST_DIR/$WATCH_LABEL.plist"

	sed -e "s|@PLIST@|$PLIST|g" -e "s|@WATCH_PLIST@|$WATCH_PLIST|g" -e "s|@CONFIG@|$CONFIG|g" -e "s|@EXAMPLE@|$EXAMPLE|g" \
		debian/postinst.in > "$STAGE/DEBIAN/postinst"
	sed -e "s|@PLIST@|$PLIST|g" -e "s|@WATCH_PLIST@|$WATCH_PLIST|g" debian/prerm.in > "$STAGE/DEBIAN/prerm"
	chmod 755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/prerm"

	SIZE="$(du -sk "$STAGE" | awk '{print $1}')"
	cat > "$STAGE/DEBIAN/control" <<CONTROL
Package: com.zgsfsec.cybridge
Name: CyBridge
Version: $VERSION
Architecture: $ARCH
Description: Reverse WebSocket bridge from a jailbroken iOS device to the Full Chain Cy console.
Maintainer: zgsfsec
Author: zgsfsec
Section: Development
Priority: optional
Depends: firmware (>= $MIN)
Installed-Size: $SIZE
CONTROL

	DEB="$OUT/com.zgsfsec.cybridge_${VERSION}_${ARCH}.deb"
	if [ "$PACKER" = "dpkg-deb" ]; then
		if ! dpkg-deb --root-owner-group -b "$STAGE" "$DEB" 2>/dev/null; then
			dpkg-deb -b "$STAGE" "$DEB"
		fi
	else
		python3 scripts/debpack.py "$STAGE" "$DEB"
	fi
	echo "built $DEB"
done
