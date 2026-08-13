#!/bin/bash
while IFS= read -r f; do
  if [[ "$f" == apps/slides/src/* ]]; then dest="${f#apps/slides/src/}";
  else dest="$f"; fi
  mkdir -p "$(dirname "$dest")"
  if [ ! -s "$dest" ]; then
    curl -sL --max-time 20 "https://cdn.jsdelivr.net/gh/genspark-ai/genoffice@main/$f" -o "$dest" || echo "FAIL $f"
  fi
done < filelist.txt
echo DONE_$(find . -type f -not -name "*.txt" -not -name "*.sh" -not -name "tree-slides.json" -not -name "package.json" -not -name "vite.config.ts" | wc -l)
