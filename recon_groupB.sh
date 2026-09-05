#!/bin/bash
# Recon: id|url -> http_code, form presence, playzipgame presence
LIST=$(grep -o '"id":[0-9]*,"sourceId":[0-9]*,"sourceName":"[^"]*","sourceUrl":"[^"]*"' /var/folders/l_/lj2pfc2d6gz99_wgmtz4yvmw0000gn/T/dsh-spill-ZtFdg3/session-a26c4ebadf19/ecdc0d98db7d-backlinks.txt | head -800 | awk 'NR%3==2')
echo "$LIST" | while IFS= read -r line; do
  id=$(echo "$line" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  url=$(echo "$line" | grep -o '"sourceUrl":"[^"]*"' | cut -d'"' -f4)
  html=$(curl -sL --max-time 25 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" "$url" 2>/dev/null)
  code=$?
  len=${#html}
  form=0
  echo "$html" | grep -qiE 'id="commentform"|id="respond"|class="comment-form"|comment-form-author|name="comment"|Leave a [Rr]eply|comment-respond' && form=1
  pz=0
  echo "$html" | grep -qi 'playzipgame.com' && pz=1
  echo "$id|$url|curl$code|len$len|form$form|pz$pz"
done
