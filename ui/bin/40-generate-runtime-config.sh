#!/bin/sh

set -eu

UPLOAD_ENABLED_ROLES="${UPLOAD_ENABLED_ROLES:-admin}"

# The value is inserted into JavaScript, so accept only role-list characters.
case "$UPLOAD_ENABLED_ROLES" in
  *[!a-zA-Z,_-]*)
    echo "UPLOAD_ENABLED_ROLES contains invalid characters." >&2
    exit 1
    ;;
esac

export UPLOAD_ENABLED_ROLES

envsubst '${UPLOAD_ENABLED_ROLES}' \
  < /opt/sca/templates/runtime-config.js.template \
  > /opt/sca/ui/runtime-config.js

echo "Generated runtime UI configuration for Upload roles."
