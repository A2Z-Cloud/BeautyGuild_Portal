#!/bin/sh
# Beauty Guild Phase 1 CRM widget: generate an official Zoho ZET upload package.
# IMPORTANT: This script does not connect to, write to, or deploy into CRM.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WORK_DIR="$SCRIPT_DIR/zet-work"
PROJECT_NAME="beauty_guild_processing"
PROJECT_DIR="$WORK_DIR/$PROJECT_NAME"

if ! command -v zet >/dev/null 2>&1; then
  printf '%s\n' 'Zoho Extension Toolkit (zet) is not installed.'
  printf '%s\n' 'Install with: npm install -g zoho-extension-toolkit'
  exit 1
fi
if [ ! -f "$SCRIPT_DIR/app/widget.html" ]; then
  printf '%s\n' 'ERROR: source/app/widget.html not found. Run this script from the extracted build kit.'
  exit 1
fi
mkdir -p "$WORK_DIR"
if [ ! -f "$PROJECT_DIR/plugin-manifest.json" ]; then
  printf '\n%s\n' 'A Zoho ZET initialisation prompt will appear.'
  printf '%s\n' 'Choose the Zoho CRM service and enter the project name: beauty_guild_processing'
  printf '%s\n' 'The scaffold and manifest must be created by ZET, not copied from the earlier ZIP.'
  cd "$WORK_DIR"
  zet init
fi
if [ ! -f "$PROJECT_DIR/plugin-manifest.json" ] || [ ! -d "$PROJECT_DIR/app" ]; then
  printf '\n%s\n' "ERROR: The expected ZET scaffold was not created in $PROJECT_DIR"
  printf '%s\n' 'Check the name you entered. Use the exact project name: beauty_guild_processing'
  exit 1
fi
cp "$SCRIPT_DIR/app/widget.html" "$SCRIPT_DIR/app/widget.js" \
   "$SCRIPT_DIR/app/styles.css" "$SCRIPT_DIR/app/brand-processing.css" "$SCRIPT_DIR/app/usability.css" \
   "$PROJECT_DIR/app/"
cd "$PROJECT_DIR"
printf '\n%s\n' 'Validating against Zoho ZET...'
zet validate
printf '\n%s\n' 'Creating the official upload ZIP with Zoho ZET...'
zet pack
printf '\n%s\n' 'Packaging complete. Look for the uploadable ZIP in:'
printf '%s\n' "$PROJECT_DIR/dist/"
printf '%s\n' 'In CRM, set Index Page to /widget.html and use Zoho / Internal hosting.'