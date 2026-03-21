#!/bin/bash

reset_step_stop_containers() {
  local compose_project="$1"
  local -a compose_cmd=("${@:2}")
  echo ""
  info "STEP 1 — Stop and remove containers (project: ${compose_project})"
  if confirm "Stop all ${compose_project} containers?"; then
    "${compose_cmd[@]}" down --remove-orphans
    success "Containers stopped and removed."
  else
    warn "Skipped container removal."
  fi
}

reset_step_remove_named_volumes() {
  local compose_project="$1"
  echo ""
  info "STEP 2 — Remove Docker named volumes (project: ${compose_project})"
  local volumes
  volumes="$(list_project_volumes "${compose_project}")"
  if [[ -z "${volumes}" ]]; then
    info "No named volumes found for project '${compose_project}'."
    return
  fi
  echo "  Volumes to be removed:"
  echo "${volumes}" | sed 's/^/    /'
  if confirm "Remove the above named volumes?"; then
    echo "${volumes}" | xargs docker volume rm
    success "Named volumes removed."
  else
    warn "Skipped named volume removal."
  fi
}

reset_step_remove_bind_db_data() {
  echo ""
  info "STEP 3 — Remove bind-mounted database data"
  local data_dir
  for data_dir in db/postgres/data db/mongo/data; do
    if [[ -d "${data_dir}" ]]; then
      if confirm "Remove ${data_dir}/?"; then
        remove_db_dir_with_alpine "${data_dir}"
        success "Removed ${data_dir}/"
      else
        warn "Skipped ${data_dir}/."
      fi
    else
      info "${data_dir}/ does not exist. Nothing to remove."
    fi
  done

  if [[ -f "api/.db_seeded" ]]; then
    rm -f api/.db_seeded
    success "Removed api/.db_seeded."
  fi
}

reset_step_remove_runtime_files() {
  echo ""
  info "STEP 4 — Remove generated runtime files"
  local env_file
  for env_file in api/.env workers/.env; do
    if [[ -f "${env_file}" ]]; then
      if confirm "Remove ${env_file}?"; then
        rm -f "${env_file}"
        success "Removed ${env_file}."
      else
        warn "Skipped ${env_file}."
      fi
    else
      info "${env_file} does not exist. Nothing to remove."
    fi
  done

  local key_files=(
    "api/keys/auth.key"
    "api/keys/auth.pub"
    "ui/.cert/cert.pem"
    "ui/.cert/key.pem"
  )
  local files_to_remove=()
  local f
  for f in "${key_files[@]}"; do
    [[ -f "${f}" ]] && files_to_remove+=("${f}")
  done
  if [[ ${#files_to_remove[@]} -gt 0 ]]; then
    echo "  Files to be removed:"
    printf "    %s\n" "${files_to_remove[@]}"
    if confirm "Remove the above keys and certs?"; then
      rm -f "${files_to_remove[@]}"
      success "Keys and certs removed."
    else
      warn "Skipped key/cert removal."
    fi
  else
    info "No key/cert files found. Nothing to remove."
  fi

  if [[ -f "workers/celery_worker.pid" ]]; then
    rm -f workers/celery_worker.pid
    success "Removed workers/celery_worker.pid."
  else
    info "workers/celery_worker.pid does not exist. Nothing to remove."
  fi
}
