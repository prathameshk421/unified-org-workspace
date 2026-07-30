FROM nginx:alpine
RUN apk add --no-cache gettext
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY public/ /usr/share/nginx/html/
ENV PORT=8080
EXPOSE 8080
CMD ["/bin/sh", "-c", "envsubst '$PORT $API_UPSTREAM $HUB_UPSTREAM $CONSOLE_UPSTREAM' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]
