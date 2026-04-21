#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:18789/plugins/okx-trade-tg-miniapp/api}"

pass=0
fail=0

check() {
  local name="$1" ; shift
  local url="$1"; shift
  local expected_code="${1:-200}"
  local body
  local code
  body="$(curl -s -w $'\n%{http_code}' "$url")"
  code="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d')"
  if [[ "$code" == "$expected_code" ]]; then
    echo "PASS $name ($code)"
    pass=$((pass+1))
  else
    echo "FAIL $name: expected $expected_code got $code"
    echo "  body: ${body:0:200}"
    fail=$((fail+1))
  fi
}

check ping           "$BASE/ping"
check meta           "$BASE/meta"
check instruments    "$BASE/market/instruments?instType=SPOT"
check ticker         "$BASE/market/ticker?instId=BTC-USDT"
check tickers        "$BASE/market/tickers?instType=SPOT"
check candles        "$BASE/market/candles?instId=BTC-USDT&bar=1H&limit=50"
check bad_instType   "$BASE/market/instruments?instType=XYZ" 400
check missing_instId "$BASE/market/ticker" 400
check bad_bar        "$BASE/market/candles?instId=BTC-USDT&bar=7S" 400

echo
echo "$pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
