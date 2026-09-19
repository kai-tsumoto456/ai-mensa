#!/bin/sh
# Smoke-test a running server: ./scripts/smoke.sh [port]
P=${1:-4319}
B="http://127.0.0.1:$P"
c() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
echo "overview        $(c $B/api/overview)"
echo "sessions        $(c "$B/api/sessions?limit=5")"
ID=$(curl -s "$B/api/sessions?limit=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(encodeURIComponent(JSON.parse(s).items[0]?.id??'')))")
echo "session detail  $(c "$B/api/sessions/$ID")"
echo "harness         $(c $B/api/harness)"
echo "evaluation      $(c $B/api/evaluation)"
echo "estimate        $(c -X POST -H 'x-ai-mensa: 1' "$B/api/evaluation/estimate?lang=ja")"
echo "POST no header  $(c -X POST $B/api/rescan)  (expect 403)"
echo "evil Host       $(c -H 'Host: evil.example' $B/api/overview)  (expect 403)"
echo "SPA fallback    $(c $B/some/route)"
echo "path traversal  $(c --path-as-is $B/../../etc/passwd)"
