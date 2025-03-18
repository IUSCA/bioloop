#!/bin/bash

# Default UID and GID
TARGET_UID=${USER_ID:-1001}
TARGET_GID=${GROUP_ID:-1001}

# Update the group ID if necessary
if [ "$(id -g scauser)" != "$TARGET_GID" ]; then
    groupmod -g "$TARGET_GID" scauser
fi

# Update the user ID if necessary
if [ "$(id -u scauser)" != "$TARGET_UID" ]; then
    usermod -u "$TARGET_UID" scauser
fi


# Execute the main command as the non-privileged user
exec su -s /bin/bash scauser -c "$*"