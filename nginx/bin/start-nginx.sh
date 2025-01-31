#!/bin/bash

# Export the environment variable
export APP_DOMAIN=${APP_DOMAIN:-demo.bioloop.io}

# Generate the Nginx configuration file from the template
envsubst '${APP_DOMAIN}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start Nginx
nginx -g 'daemon off;'