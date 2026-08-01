#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <title> <message>" >&2
  exit 2
fi

title=$1
message=$2

while :; do
  id="x-$(openssl rand -hex 4)"
  if ! tmux has-session -t "$id" 2>/dev/null; then
    break
  fi
done

printf -v quoted_title '%q' "$title"
printf -v prompt '%s\n\n%s' \
  'Return exactly the notification below. Preserve its Markdown link. Do not add commentary or use tools.' \
  "$message"
printf -v quoted_prompt '%q' "$prompt"
launch="sleep 2; cd /root && exec pi --thinking off --no-tools --name $quoted_title $quoted_prompt"

tmux new-session -d -s "$id" "$launch"
tmux set-option -t "$id" @xconsole_title "$title"
tmux set-option -t "$id" @xconsole_status working
tmux set-option -t "$id" @xconsole_owner you
tmux set-option -t "$id" @xconsole_origin scheduled
tmux set-option -t "$id" status off
tmux set-option -t "$id" set-titles off

printf '%s\n' "$id"
