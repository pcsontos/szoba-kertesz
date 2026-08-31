#!/usr/bin/env bash
# HF4 — a leadandó PDF előállítása a markdown forrásokból.
#
#   ./docs/hf4/build-pdf.sh            -> docs/hf4/HF4-leadas.pdf
#
# Előfeltétel: pandoc + xelatex (macOS: `brew install pandoc` + MacTeX).
# Az xelatex azért kell, mert a magyar ő/ű a pdflatex alapértelmezett kódolásában eltörik.
#
# A sorrend SZÁNDÉKOS és a címkék is azok: az 1-6. pont a PONTOZOTT anyag (a kiírás
# „kb. 4-7 oldal"-a), az A/B melléklet a bizonyíték, ami NEM számít bele. Ha a két levél
# „Melléklet"-ként lenne címkézve, egy értékelő kihagyhatná a terjedelem-számításból.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

OUT="docs/hf4/HF4-leadas.pdf"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for f in docs/hf4-ai-act.md docs/hf4/level-jogi-csapatnak.md \
         docs/hf4/valasz-jogi-csapatnak.md docs/hf4/hivatkozasok.md \
         docs/hf4/llm-teszt-atirat.md; do
  [ -f "$f" ] || { echo "HIÁNYZIK: $f" >&2; exit 1; }
done

# A `\frenchspacing` nélkül a LaTeX a "3. cikk" pontját mondatvégnek hiszi, és tág
# szóközt tesz utána — ez MINDEN cikkhivatkozást elcsúfít.
printf '\\frenchspacing\n' > "$TMP/preamble.tex"

{
  echo '---'
  echo 'title: "HF4 — A Szoba-kertész AI-asszisztens AI Act-besorolása"'
  echo 'author: "Csontos Péter"'
  echo 'date: "2026. augusztus 31."'
  echo 'lang: hu'
  echo '---'
  echo
  echo '> **A dokumentum felépítése.** Az 1-6. pont a leadandó anyag; a 4. és a 6. pont'
  echo '> levele a törzsszöveg után, teljes terjedelmében következik. Az **A. és B. melléklet**'
  echo '> (hivatkozás-jegyzék és az LLM-teszt nyers átirata) **bizonyíték, nem leadandó szöveg** —'
  echo '> a terjedelembe nem számít bele.'
  echo
  cat docs/hf4-ai-act.md
  printf '\n\\newpage\n\n# 4. pont — Email a jogi csapatnak (teljes szöveg)\n\n'
  cat docs/hf4/level-jogi-csapatnak.md
  printf '\n\\newpage\n\n# 6. pont — Válasz a jogi csapatnak (teljes szöveg)\n\n'
  cat docs/hf4/valasz-jogi-csapatnak.md
  printf '\n\\newpage\n\n# A. melléklet — Ellenőrzött hivatkozás-jegyzék\n\n'
  sed '1{/^# /d;}' docs/hf4/hivatkozasok.md
  printf '\n\\newpage\n\n# B. melléklet — Az LLM-teszt nyers átirata\n\n'
  sed '1{/^# /d;}' docs/hf4/llm-teszt-atirat.md
} > "$TMP/osszefuzott.md"

pandoc "$TMP/osszefuzott.md" -o "$OUT" \
  --pdf-engine=xelatex \
  -V geometry:margin=2.2cm -V fontsize=10pt \
  -V colorlinks=true -V linkcolor=black -V urlcolor=blue \
  -H "$TMP/preamble.tex" \
  --toc --toc-depth=2 \
  2>&1 | grep -vE 't1enc|inputenc|magyar\]\{babel\}|accented chars|hyphenated' || true

echo "kész: $OUT ($(pdfinfo "$OUT" | awk '/Pages/{print $2}') oldal)"
