#!/bin/bash

# Source the .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi


domains=(${APP_DOMAIN:-demo-bioloop.io})
rsa_key_size=4096
data_path="/opt/sca/nginx/certbot"
email="${SSL_EMAIL:-sca-ops-l@iu.edu}" # Adding a valid address is strongly recommended
staging=0 # Set to 1 if you're testing your setup to avoid hitting request limits


echo "### Checking data path exists ..."
if [ -d "$data_path/conf" ]; then
  mkdir -p "$data_path/conf"
fi


echo "### Checking config exists ..."
if [ -e "$data_path/conf/ssl-dhparams.pem" ]; then
    echo "### Creating dhparam file ..."
    openssl dhparam -out $data_path/conf/ssl-dhparams.pem 4096 
fi

if [ -e "$data_path/conf/options-ssl-nginx.conf" ]; then
    echo "### Creating options-ssl-nginx.conf file ..."
    cp nginx/certbot/conf/options-ssl-nginx.conf $data_path/conf/options-ssl-nginx.conf
fi

docker compose -f "docker-compose.yml" up -d nginx certbot

echo "### Creating dummy certificate for $domains ..."
path="/etc/letsencrypt/live/$domains"
mkdir -p "$data_path/conf/live/$domains"
docker compose -f "docker-compose.yml" run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1\
    -keyout '$path/privkey.pem' \
    -out '$path/fullchain.pem' \
    -subj '/CN=localhost'" certbot
echo

echo "### Starting nginx ..."
docker compose  -f "docker-compose.yml" up --force-recreate -d nginx
echo

echo "### Deleting dummy certificate for $domains ..."
docker compose  -f "docker-compose.yml" run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$domains && \
  rm -Rf /etc/letsencrypt/archive/$domains && \
  rm -Rf /etc/letsencrypt/renewal/$domains.conf" certbot
echo

echo "### Requesting Let's Encrypt certificate for $domains ..."
#Join $domains to -d args
domain_args=""
for domain in "${domains[@]}"; do
    domain_args="$domain_args -d $domain"
done

# Select appropriate email arg
case "$email" in
"") email_arg="--register-unsafely-without-email" ;;
*) email_arg="--email $email" ;;
esac

# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

docker compose -f "docker-compose.yml" run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal" certbot
echo

#echo "### Reloading nginx ..."
docker compose -f "docker-compose.yml" exec nginx nginx -s reload