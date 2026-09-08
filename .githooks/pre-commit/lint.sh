#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get the repository root directory
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Get the list of staged files (using array-safe method)
IFS=$'\n' read -r -d '' -a staged_files < <(git diff --cached --name-only --diff-filter=AM && printf '\0') || true

# Exit early if no files are staged for addition or modification
if [[ ${#staged_files[@]} -eq 0 ]]; then
  print_info "No files staged for addition or modification. Exiting without linting."
  exit 0
fi

# Function to check if a file is a lintable JavaScript/TypeScript file
is_lintable_file() {
  local file="$1"
  local extension="${file##*.}"
  
  case "$extension" in
    js|jsx|ts|tsx|vue|cjs|mjs)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# Function to process async results
process_async_result() {
  local process_name="$1"
  local temp_file="$2"
  local exit_code=0
  
  if [[ -f "$temp_file" ]]; then
    local result_line
    result_line=$(head -n 1 "$temp_file")
    local status="${result_line%%:*}"
    local message="${result_line#*:}"
    
    case "$status" in
      SUCCESS)
        print_info "$message"
        ;;
      WARN)
        print_warn "$message"
        ;;
      ERROR)
        print_error "$message"
        if [[ $(wc -l < "$temp_file") -gt 1 ]]; then
          tail -n +2 "$temp_file"
        fi
        exit_code=1
        ;;
    esac
  else
    print_error "$process_name process failed to create output file"
    exit_code=1
  fi
  
  return $exit_code
}

# Function to run all linting checks concurrently
run_concurrent_checks() {
  # Categorize files first
  local ui_files=()
  local api_files=()
  
  # Categorize staged files
  for file in "${staged_files[@]}"; do
    if [[ -z "$file" ]]; then
      continue
    fi
    
    # Check if file still exists (wasn't deleted)
    if [[ ! -f "$file" ]]; then
      continue
    fi
    
    if [[ $file == ui/* ]] && is_lintable_file "$file"; then
      ui_files+=("${file#ui/}")
    elif [[ $file == api/* ]] && is_lintable_file "$file"; then
      api_files+=("${file#api/}")
    fi
  done
  
  # Create temporary files for async communication
  local temp_dir
  temp_dir=$(mktemp -d)
  local spell_temp="$temp_dir/spell.out"
  local ui_temp="$temp_dir/ui.out"
  local api_temp="$temp_dir/api.out"
  
  # Start all processes in background
  # print_info "Starting concurrent lint checks..."
  print_info "- Spell check: ${#staged_files[@]} file(s)"
  print_info "- UI ESLint: ${#ui_files[@]} file(s)"
  print_info "- API ESLint: ${#api_files[@]} file(s)"
  
  # Start background processes
  run_spell_check_async "$spell_temp" &
  local spell_pid=$!
  
  if [[ ${#ui_files[@]} -gt 0 ]]; then
    run_eslint_async "ui" "$ui_temp" "${ui_files[@]}" &
    local ui_pid=$!
  else
    run_eslint_async "ui" "$ui_temp" &
    local ui_pid=$!
  fi
  
  if [[ ${#api_files[@]} -gt 0 ]]; then
    run_eslint_async "api" "$api_temp" "${api_files[@]}" &
    local api_pid=$!
  else
    run_eslint_async "api" "$api_temp" &
    local api_pid=$!
  fi
  
  # Wait for all processes to complete
  local exit_code=0
  
  # print_info "Waiting for spell check to complete..."
  if ! wait $spell_pid; then
    exit_code=1
  fi
  
  # print_info "Waiting for UI ESLint to complete..."
  if ! wait $ui_pid; then
    exit_code=1
  fi
  
  # print_info "Waiting for API ESLint to complete..."
  if ! wait $api_pid; then
    exit_code=1
  fi
  
  # Process results
  # print_info "Processing results..."
  
  if ! process_async_result "Spell check" "$spell_temp"; then
    exit_code=1
  fi
  
  if ! process_async_result "UI ESLint" "$ui_temp"; then
    exit_code=1
  fi
  
  if ! process_async_result "API ESLint" "$api_temp"; then
    exit_code=1
  fi
  
  # Cleanup
  rm -rf "$temp_dir"
  
  return $exit_code
}

# Function to run spell check in background
run_spell_check_async() {
  local temp_file="$1"
  {
    local start_time=$(date +%s)
    local cspell_output
    local cspell_status=0
    
    # Determine cspell path (prefer local installation to avoid npx overhead)
    local cspell_cmd="npx cspell"
    if [[ -x "$REPO_ROOT/node_modules/.bin/cspell" ]]; then
      cspell_cmd="$REPO_ROOT/node_modules/.bin/cspell"
    fi
    
    # Run cspell and capture output (with cache for faster subsequent runs)
    cspell_output=$($cspell_cmd --no-progress --cache "${staged_files[@]}" 2>&1)
    cspell_status=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Handle cspell results - check both exit code and output for actual issues
    if [[ $cspell_status -ne 0 ]] || [[ $cspell_output =~ "Issues found: "[1-9][0-9]* ]]; then
      if [[ $cspell_output == *"Files checked: 0"* ]]; then
        echo "WARN:No files were checked by cspell (likely no supported file types) (${duration}s)" > "$temp_file"
      else
        echo "ERROR:Spelling errors found: (${duration}s)" > "$temp_file"
        echo "$cspell_output" >> "$temp_file"
        exit 1
      fi
    else
      echo "SUCCESS:Spell check passed (${duration}s)" > "$temp_file"
    fi
  }
}

# Function to run ESLint in background
run_eslint_async() {
  local dir="$1"
  local temp_file="$2"
  shift 2
  local files=("$@")
  
  {
    local start_time=$(date +%s)
    
    if [[ ${#files[@]} -eq 0 ]]; then
      local end_time=$(date +%s)
      local duration=$((end_time - start_time))
      echo "SUCCESS:No files to lint in $dir (${duration}s)" > "$temp_file"
      return 0
    fi
    
    # Check if directory exists
    if [[ ! -d "$dir" ]]; then
      local end_time=$(date +%s)
      local duration=$((end_time - start_time))
      echo "ERROR:Directory $dir does not exist (${duration}s)" > "$temp_file"
      exit 1
    fi
    
    # Check if eslint is available
    local eslint_path="$dir/node_modules/.bin/eslint"
    if [[ ! -x "$eslint_path" ]]; then
      local end_time=$(date +%s)
      local duration=$((end_time - start_time))
      echo "ERROR:ESLint not found at $eslint_path (${duration}s)" > "$temp_file"
      echo "Please run 'npm install --ignore-scripts' in the $dir directory" >> "$temp_file"
      exit 1
    fi
    
    # Change to directory and run eslint
    local current_dir
    current_dir=$(pwd)
    cd "$dir" || exit 1
    
    # Use proper error handling
    local eslint_output
    local eslint_status=0
    if ! eslint_output=$("$eslint_path" "${files[@]}" 2>&1); then
      eslint_status=$?
    fi
    
    cd "$current_dir" || exit 1
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ $eslint_status -ne 0 ]]; then
      echo "ERROR:ESLint failed in $dir directory (${duration}s)" > "$temp_file"
      echo "$eslint_output" >> "$temp_file"
      exit $eslint_status
    fi
    
    echo "SUCCESS:ESLint passed for ${#files[@]} file(s) in $dir/ (${duration}s)" > "$temp_file"
  }
}

# Main execution
main() {
  print_info "Starting pre-commit lint checks..."
  
  # Run all checks concurrently
  if ! run_concurrent_checks; then
    print_error "One or more lint checks failed. Please fix the issues before committing."
    exit 1
  fi
  
  print_info "All lint checks passed successfully!"
}

# Execute main function
main "$@"
