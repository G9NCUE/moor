#!/usr/bin/env bash
# Runs inside android-emulator-runner, from the repo root, with a booted 32-bit emulator.
#
# The question is narrow: does the Bare runtime load in a 32-bit process? The answer is
# libbare-kit.so in the app's own /proc/<pid>/maps. On a 64-bit control (Pixel API 35,
# arm64) that library is loaded by the class loader before "Running main" ever appears,
# so it does not depend on onboarding, a seed, or the worklet being asked for anything.
#
# The first version of this script could not tell "not loaded" from "maps unreadable" —
# both produced an empty grep, and it reported the former. Readability is now proven
# against the app's own process before any conclusion is drawn.
#
# logcat cannot stand in for this: the `nativeloader` tag that names every dlopen on
# API 35 does not appear at all on API 29, so a missing libbare-kit line there means
# nothing.
set -uo pipefail

PKG=io.moor.wallet
APK=app/android/app/build/outputs/apk/release/app-release.apk
CRASH='dlopen failed|UnsatisfiedLinkError|Fatal signal|FATAL EXCEPTION'

app_pid() { adb shell pidof "$PKG" 2>/dev/null | tr -d '\r' | awk '{print $1}'; }
maps_lines() { adb shell cat "/proc/$1/maps" 2>/dev/null | wc -l | tr -d ' '; }

# ---- the guest must actually be 32-bit, or the run proves nothing ----------------
ABILIST=$(adb shell getprop ro.product.cpu.abilist | tr -d '\r')
ABILIST64=$(adb shell getprop ro.product.cpu.abilist64 | tr -d '\r')
echo "ro.product.cpu.abilist   = ${ABILIST}"
echo "ro.product.cpu.abilist64 = ${ABILIST64:-<empty>}"
case "$ABILIST" in *x86_64*) echo "FAIL: guest exposes x86_64"; exit 1 ;; esac
if [ -n "$ABILIST64" ]; then echo "FAIL: guest exposes a 64-bit ABI"; exit 1; fi
case "$ABILIST" in *x86*) : ;; *) echo "FAIL: guest does not list x86"; exit 1 ;; esac

adb root >/dev/null 2>&1 || true
adb wait-for-device
echo "adb shell uid = $(adb shell id -u 2>/dev/null | tr -d '\r')"

adb install -r "$APK" || { echo "FAIL: install rejected — ABI or minSdk"; exit 1; }
adb logcat -c
adb shell am start -n "$PKG/.MainActivity" || { echo "FAIL: activity would not start"; exit 1; }

# ---- prove we can read the app's maps before trusting what is not in them --------
readable=no
for i in $(seq 1 12); do
  sleep 5
  PID=$(app_pid)
  [ -z "$PID" ] && continue
  n=$(maps_lines "$PID")
  if [ "${n:-0}" -gt 0 ]; then
    echo "maps readable for pid $PID: $n lines"
    readable=yes
    break
  fi
done

if [ "$readable" != "yes" ]; then
  PID=$(app_pid)
  echo "INCONCLUSIVE: cannot read /proc/<pid>/maps (uid $(adb shell id -u 2>/dev/null | tr -d '\r'), pid ${PID:-none})."
  echo "              Absence of libbare-kit.so would be unprovable, so nothing is claimed."
  adb logcat -d > logcat-full.txt 2>/dev/null
  exit 1
fi

# ---- now the actual question ----------------------------------------------------
mapped=no
for i in $(seq 1 60); do
  adb logcat -d > logcat-full.txt 2>/dev/null
  if grep -qE "$CRASH" logcat-full.txt; then
    echo "FAIL: native load failure or crash after ~$((i * 5))s"
    grep -E "$CRASH" -A15 logcat-full.txt | head -80
    exit 1
  fi

  PID=$(app_pid)
  if [ -z "$PID" ]; then
    echo "FAIL: process gone after ~$((i * 5))s with no crash marker"
    tail -100 logcat-full.txt
    exit 1
  fi

  if adb shell cat "/proc/$PID/maps" 2>/dev/null | grep -q 'libbare-kit\.so'; then
    echo "libbare-kit.so mapped into pid $PID after ~$((i * 5))s"
    mapped=yes
    break
  fi
  sleep 5
done

adb logcat -d > logcat-full.txt 2>/dev/null
grep -iE 'bare|wdk|worklet|moor|dlopen|UnsatisfiedLink|FATAL|Fatal signal|SoLoader|nativeloader' \
  logcat-full.txt > logcat-wdk.txt 2>/dev/null || true

PID=$(app_pid)
echo "===== every shared object the app has loaded ====="
adb shell cat "/proc/$PID/maps" 2>/dev/null | grep -oE '/[^ ]*\.so' | sort -u | tee loaded-libs.txt | head -60
echo "( $(wc -l < loaded-libs.txt) distinct objects )"

echo "===== worklet and native log lines ====="
head -80 logcat-wdk.txt

if [ "$mapped" = "yes" ]; then
  echo
  echo "PASS: the Bare runtime loaded in a 32-bit process."
  echo "      Not exercised: a wallet, a chain read, or the DHT."
  exit 0
fi

echo
echo "FAIL: libbare-kit.so absent from readable maps after 5 minutes."
echo "      Maps were proven readable above, so this is a real absence."
exit 1
