#!/bin/bash


# Default UID and GID
TARGET_UID=${UID:-1001}
TARGET_GID=${GID:-1001}

# Update the group ID if necessary
if [ "$(id -g scauser)" != "$TARGET_GID" ]; then
    groupmod -g "$TARGET_GID" scauser
fi

# Update the user ID if necessary
if [ "$(id -u scauser)" != "$TARGET_UID" ]; then
    usermod -u "$TARGET_UID" scauser
fi

# Ensure ownership of the working directory
chown -R TARGET_UID:TARGET_GID /opt/sca

# Execute the main command as the non-privileged user
exec gosu scauser "$@"