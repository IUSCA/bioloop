#!/bin/bash
#
# check-ui-vocabulary.sh
#
# Reports user-facing text that breaks the v2 UI vocabulary rules.
#
#   bin/check-ui-vocabulary.sh           check the repository
#   bin/check-ui-vocabulary.sh <root>    check another checkout rooted at <root>
#
# It flags three things:
#   - "grant", "grants", "granted", or "granting" in text a user reads;
#   - "remove" wording about access, which should say "revoke";
#   - "subject", which should be a name or "user or group".
#
# It reads template text, static attribute values, and string literals. It skips
# comments, identifiers such as grants.value or manage_grants, and lines that never
# reach a user (description: and reason: fields, logger and console calls, thrown
# Errors). It is a heuristic: read every hit, and do not treat silence as proof.
#
# Exits 1 when it reports a hit, 0 otherwise.
#
# @see docs/contributing/v2-ui-vocabulary.md
#
# cspell:ignore bremov

set -euo pipefail

root="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$root"

dirs=(
  ui/src/components/v2
  ui/src/pages/v2
  ui/src/services/v2
  api/src/state
  api/src/routes/grants.js
  api/src/routes/access_requests.js
  api/src/services/grants
  api/src/services/access_requests
)
existing=()
for d in "${dirs[@]}"; do [[ -e "$d" ]] && existing+=("$d"); done

find "${existing[@]}" -type f \( -name '*.vue' -o -name '*.js' \) -print0 \
  | xargs -0 perl -e '
use strict; use warnings;

my $hits = 0;

# A word not glued to identifier punctuation, so grants.value and manage_grants pass
# while a sentence ending in "grants." does not.
my $GRANT = qr/(?<![\w\-.\/:@])grant(?:s|ed|ing)?(?![\w\-\/:@]|\.\w)/i;

# "remove" near access, as in "Remove All Access", "removing this permission", or
# "access will be removed".
my $REMOVE = qr/\bremov\w*\s+(?:\w+\s+){0,2}(?:access|permissions?)\b|\b(?:access|permissions?)\b[^.]{0,40}\bremov/i;

# "subject", the code term for the user or group a permission is given to.
my $SUBJECT = qr/(?<![\w\-.\/:@])subjects?(?![\w\-\/:@]|\.\w)/i;

# Lines whose literals never reach a user.
my $SILENT = qr/\b(?:description|reason)\s*:|throw new Error|console\.|logger\.|require\(|^\s*import\b/;

sub blank { my $s = shift; $s =~ s/[^\n]/ /g; $s }

sub report {
  my ($file, $text, $offset, $frag) = @_;
  # Prose has a space or reads as a capitalised word; SQL and enum values are neither.
  my $prose = $frag =~ /\s/ || $frag =~ /^\s*[A-Z][a-z]/;
  return unless $prose;
  return if $frag =~ /\b(?:SELECT|JOIN|WHERE)\b/;
  my ($why, $at);
  if ($frag =~ $GRANT) { ($why, $at) = ("grant", $-[0]) }
  elsif ($frag =~ $REMOVE) { ($why, $at) = ("remove", $-[0]) }
  elsif ($frag =~ $SUBJECT) { ($why, $at) = ("subject", $-[0]) }
  return unless $why;
  my $line = 1 + (substr($text, 0, $offset + $at) =~ tr/\n//);
  my ($src) = (split /\n/, $text, -1)[$line - 1];
  return if $src =~ $SILENT;
  (my $shown = $frag) =~ s/\s+/ /g;
  $shown =~ s/^ | $//g;
  print "$file:$line: [$why] $shown\n";
  $hits++;
}

# Report the quoted literals inside a JavaScript span starting at $base.
sub scan_js {
  my ($file, $text, $js, $base) = @_;
  $js =~ s{/\*.*?\*/}{blank($&)}gse;
  $js =~ s{(^|[\s;,(){}])//[^\n]*}{$1 . blank(substr($&, length $1))}gme;
  while ($js =~ /\x27(?:[^\x27\\\n]|\\.)*\x27|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gs) {
    my ($lit, $at) = ($&, $-[0]);
    # Blank each ${...} to its own length so offsets hold, and scan it as code.
    while ($lit =~ /\$\{([^{}]*)\}/g) { scan_js($file, $text, $1, $base + $at + $-[1]) }
    $lit =~ s/\$\{[^{}]*\}/blank($&)/ge;
    report($file, $text, $base + $at + 1, substr($lit, 1, -1));
  }
}

# Report text nodes, static attribute values, and literals in bindings.
sub scan_template {
  my ($file, $text, $tpl, $base) = @_;
  $tpl =~ s/<!--.*?-->/blank($&)/gse;
  my $tag = qr/<(?:[^>"\x27]|"[^"]*"|\x27[^\x27]*\x27)*>/;
  my $pos = 0;
  while ($tpl =~ /$tag/g) {
    my ($t, $start, $end) = ($&, $-[0], $+[0]);
    scan_text($file, $text, substr($tpl, $pos, $start - $pos), $base + $pos);
    while ($t =~ /([:@#\w.\-]+)="([^"]*)"/g) {
      my ($name, $value, $at) = ($1, $2, $-[2]);
      if ($name =~ /^[:@#]|^v-/) { scan_js($file, $text, $value, $base + $start + $at) }
      else { report($file, $text, $base + $start + $at, $value) }
    }
    $pos = $end;
  }
  scan_text($file, $text, substr($tpl, $pos), $base + $pos);
}

sub scan_text {
  my ($file, $text, $chunk, $base) = @_;
  while ($chunk =~ /\{\{(.*?)\}\}/gs) { scan_js($file, $text, $1, $base + $-[1]) }
  $chunk =~ s/\{\{.*?\}\}/blank($&)/gse;
  report($file, $text, $base, $chunk) if $chunk =~ /\S/;
}

for my $file (@ARGV) {
  open my $fh, "<", $file or die "$file: $!";
  my $text = do { local $/; <$fh> };
  close $fh;
  if ($file =~ /\.vue$/) {
    if ($text =~ /^<template>(.*)^<\/template>/ms) { scan_template($file, $text, $1, $-[1]) }
    while ($text =~ /<script[^>]*>(.*?)<\/script>/gs) { scan_js($file, $text, $1, $-[1]) }
  } else {
    scan_js($file, $text, $text, 0);
  }
}

exit($hits ? 1 : 0);
'
