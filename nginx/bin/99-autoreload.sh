# 99-autoreload.sh

#!/bin/sh
while :; do
    # Optional: Instead of sleep, detect config changes and only reload if necessary.
    nginx -t && nginx -s reload
    sleep 6h
done &