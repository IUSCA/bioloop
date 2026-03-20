# Nginx Prod Changes for Notifications SSE

Target file: `nginx_config.conf`

## Required change

Add these two `location` blocks inside the HTTPS `server { ... }` block, **before** `location /api/ { ... }`.

```nginx
location = /api/notifications/stream {
    proxy_pass http://172.19.0.2:3030/notifications/stream$is_args$args;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_cache off;
    proxy_buffering off;
    proxy_read_timeout 1h;
    add_header X-Accel-Buffering no;
}

location ~ ^/api/notifications/([^/]+)/stream$ {
    proxy_pass http://172.19.0.2:3030/notifications/$1/stream$is_args$args;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_cache off;
    proxy_buffering off;
    proxy_read_timeout 1h;
    add_header X-Accel-Buffering no;
}
```

## Why

- `/api/notifications/stream` supports SSE for admin/operator flow.
- `/api/notifications/:username/stream` supports SSE for user ownership flow.
- SSE requires buffering disabled and long read timeout to avoid dropped/stalled event streams.
