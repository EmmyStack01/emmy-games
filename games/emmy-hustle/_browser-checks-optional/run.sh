#!/bin/bash
# usage: run.sh <script.py> [args...]  — serves the harness for the duration of the run
cd /home/claude/bc
python3 -m http.server 8765 >/tmp/srv.log 2>&1 &
SRV=$!
sleep 1
python3 "$@"
RC=$?
kill $SRV 2>/dev/null
exit $RC
