#!/bin/bash

project_dir=$(dirname "$(readlink -f "$0")")

# Default UID and GID
TARGET_UID=${USER_ID:-1001}
TARGET_GID=${GROUP_ID:-1001}


echo "Changing UID and GID of scauser to $TARGET_UID:$TARGET_GID"
groupadd -g $TARGET_GID scauser
useradd -m -u $TARGET_UID -g $TARGET_GID scauser


# Fix ownership of files in the working directory
chown -R $TARGET_UID:$TARGET_GID /opt/sca/app


# Execute the main command as the non-privileged user
exec su -s /bin/bash scauser -c "$project_dir/bin/entrypoint.sh && $*"
# exec su -s /bin/bash scauser -c "tail -f /dev/null"
