FROM nginx:alpine


RUN rm -f /etc/nginx/conf.d/default.conf
COPY ./conf/nginx.conf /etc/nginx/conf.d

RUN chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d

RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

VOLUME /usr/share/nginx/html



EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
