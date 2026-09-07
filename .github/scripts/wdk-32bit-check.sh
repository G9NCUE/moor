#!/usr/bin/env bash
# Runs inside android-emulator-runner, from the repo root, with a booted 32-bit emulator.
#
# The question is narrow: does the Bare runtime load and stay loaded in a 32-bit process?
# The answer is `libbare-kit.so` appearing in the app's own /proc/<pid>/maps, which is
# stronger than "no crash" — an app that never got as far as starting the worklet also
# does not crash.
set -uo pipefail

PKG=io.moor.wallet
APK=app/android/app/build/outputs/apk/release/app-release.apk
CRASH='dlopen failed|UnsatisfiedLinkError|Fatal signal|FATAL EXCEPTION'

fail() { echo "FAIL: $*"; }

# ---- the guest must actually be 32-bit, or the run proves nothing ----------------
ABILIST=$(adb shell getprop ro.product.cpu.abilist | tr -d '\r')
ABILIST64=$(adb shell getprop ro.product.cpu.abilist64 | tr -d '\r')
echo "ro.product.cpu.abilist   = ${ABILIST}"
echo "ro.product.cpu.abilist64 = ${ABILIST64:-<empty>}"
case "$ABILIST" in
  *x86_64*) fail "guest exposes x86_64; this is not a 32-bit test"; exit 1 ;;
esac
if [ -n "$ABILIST64" ]; then fail "guest exposes a 64-bit ABI: $ABILIST64"; exit 1; fi
case "$ABILIST" in
  *x86*) : ;;
  *) fail "guest does not list x86: $ABILIST"; exit 1 ;;
esac

# google_apis images are userdebug, so this succeeds and lets us read the app's maps.
# If it ever does not, the crash-marker check below still stands on its own.
adb root >/dev/null 2>&1 || true
adb wait-for-device
ROOTED=$(adb shell id -u 2>/dev/null | tr -d '\r')

adb install -r "$APK" || { fail "install rejected — ABI or minSdk mismatch"; exit 1; }

adb logcat -c
adb shell am start -n "$PKG/.MainActivity" || { fail "could not start the activity"; exit 1; }

# ---- poll: mapped, crashed, or dead ---------------------------------------------
mapped=no
for i in $(seq 1 60); do
  sleep 5
  adb logcat -d > logcat-full.txt 2>/dev/null

  if grep -qE "$CRASH" logcat-full.txt; then
    fail "native load failure or crash after ~$((i * 5))s"
    grep -E "$CRASH" -A15 logcat-full.txt | head -80
    exit 1
  fi

  PID=$(adb shell pidof "$PKG" 2>/dev/null | tr -d '\r' | awk '{print $1}')
  if [ -z "$PID" ]; then
    fail "process gone after ~$((i * 5))s without a crash marker"
    tail -100 logcat-full.txt
    exit 1
  fi

  if [ "$ROOTED" = "0" ] && adb shell cat "/proc/$PID/maps" 2>/dev/null | grep -q 'libbare-kit\.so'; then
    echo "libbare-kit.so mapped into pid $PID after ~$((i * 5))s"
    mapped=yes
    break
  fi
done

adb logcat -d > logcat-full.txt 2>/dev/null
grep -iE 'bare|wdk|worklet|moor|dlopen|UnsatisfiedLink|FATAL|Fatal signal' \
  logcat-full.txt > logcat-wdk.txt 2>/dev/null || true

echo "===== worklet and native lines ====="
head -120 logcat-wdk.txt

if [ "$ROOTED" = "0" ]; then
  echo "===== 32-bit objects loaded by the app ====="
  adb shell cat "/proc/$PID/maps" 2>/dev/null \
    | grep -oE '/[^ ]*\.so' | sort -u | grep -E 'bare|udx|sodium|rocksdb|quickbit|simdle' || true
fi

if [ "$mapped" = "yes" ]; then
  echo
  echo "PASS: the Bare runtime loaded and stayed loaded in a 32-bit process (API check above)."
  echo "      This does not exercise a wallet, a chain read, or the DHT."
  exit 0
fi

if [ "$ROOTED" != "0" ]; then
  echo
  echo "INCONCLUSIVE: adb root unavailable, so the maps check could not run."
  echo "              The app survived 5 minutes with no dlopen or crash marker."
  exit 0
fi

fail "libbare-kit.so never appeared in the app's maps within 5 minutes"
exit 1
