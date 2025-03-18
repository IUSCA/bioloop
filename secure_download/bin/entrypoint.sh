#!/bin/bash

# Default UID and GID
TARGET_UID=${USER_ID:-1001}
TARGET_GID=${GROUP_ID:-1001}

groupadd -g $TARGET_GID scauser
useradd -m -u $TARGET_UID -g $TARGET_GID scauser


# Execute the main command as the non-privileged user
exec su -s /bin/bash scauser -c "$*"