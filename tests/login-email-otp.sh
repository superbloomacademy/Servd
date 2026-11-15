#!/usr/bin/env bash
# End-to-end test of customer login (mobile number + OTP sent to email).
# Needs the app running in TESTING MODE (no EMAIL_PROVIDER in .env): npm run dev
# Run: bash tests/login-email-otp.sh   (optional: BASE=http://localhost:3001)
B=${BASE:-http://localhost:3001}; T=$(mktemp -d); cd "$T" || exit 1
P1=9$(( RANDOM * 30000 + RANDOM + 100000000 )); P2=8$(( RANDOM * 30000 + RANDOM + 100000000 )); E="tester$RANDOM@gmail.com"
pass=0; fail=0; chk(){ if echo "$2" | grep -q -- "$3"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 → $2"; fail=$((fail+1)); fi; }
post(){ curl -s -b "$3" -c "$3" -H 'content-type: application/json' -d "$2" "$B$1"; }
otp(){ echo "$1" | sed -n 's/.*"devOtp":"\([0-9]*\)".*/\1/p'; }
r=$(post /api/auth/otp "{\"phone\":\"$P1\"}" a.jar); chk "new number asks for email" "$r" '"needEmail":true'
r=$(post /api/auth/otp "{\"phone\":\"$P1\",\"email\":\"bad@x\"}" a.jar); chk "bad email rejected" "$r" 'valid email'
r=$(post /api/auth/otp "{\"phone\":\"$P1\",\"email\":\"$E\"}" a.jar); chk "code sent, email masked" "$r" '"sentTo":"te•'; chk "flagged new" "$r" '"isNew":true'; C=$(otp "$r"); chk "6-digit code" "$C" '^[0-9]\{6\}$'
r=$(post /api/auth/otp "{\"phone\":\"$P1\",\"email\":\"$E\"}" a.jar); chk "resend too fast blocked" "$r" 'wait'
r=$(post /api/auth/verify "{\"phone\":\"$P1\",\"otp\":\"000000\"}" a.jar); chk "wrong code rejected" "$r" 'Wrong code'
r=$(post /api/auth/verify "{\"phone\":\"$P1\",\"otp\":\"$C\",\"name\":\"Ravi\"}" a.jar); chk "correct code logs in, email saved" "$r" "\"email\":\"$E\""
r=$(curl -s -b a.jar "$B/api/me"); chk "account shows email" "$r" "$E"
r=$(curl -s -b a.jar -X PATCH -H 'content-type: application/json' -d '{"name":"Ravi K","email":"hacker@evil.com"}' "$B/api/me"); chk "email can't be changed from profile" "$r" "$E"
r=$(post /api/auth/otp "{\"phone\":\"$P1\"}" b.jar); chk "returning: number only, code goes to saved email" "$r" '"sentTo":"te•'; chk "returning not new" "$r" '"isNew":false'
C=$(otp "$r"); r=$(post /api/auth/verify "{\"phone\":\"$P1\",\"otp\":\"$C\"}" b.jar); chk "returning login works" "$r" "\"phone\":\"$P1\""
r=$(post /api/auth/otp "{\"phone\":\"$P2\",\"email\":\"${E^^}\"}" c.jar); chk "same email on another number blocked (any case)" "$r" 'email_taken'
r=$(post /api/auth/otp "{\"email\":\"$E\"}" d.jar); chk "email login: known email gets code" "$r" '"sentTo"'
C=$(otp "$r"); r=$(post /api/auth/verify "{\"email\":\"$E\",\"otp\":\"$C\"}" d.jar); chk "email login works" "$r" "\"phone\":\"$P1\""
r=$(post /api/auth/otp "{\"email\":\"new$RANDOM@yahoo.com\"}" e.jar); chk "unknown email asks for number" "$r" '"needPhone":true'
r=$(post /api/auth/otp "{\"phone\":\"$P2\",\"email\":\"other$RANDOM@gmail.com\"}" f.jar); for i in 1 2 3 4 5; do post /api/auth/verify "{\"phone\":\"$P2\",\"otp\":\"111111\"}" f.jar >/dev/null; done
C=$(otp "$r"); r=$(post /api/auth/verify "{\"phone\":\"$P2\",\"otp\":\"$C\"}" f.jar); chk "locked after 5 wrong tries" "$r" 'Too many'
echo "== $pass passed, $fail failed"; rm -rf "$T"; [ "$fail" = 0 ]
