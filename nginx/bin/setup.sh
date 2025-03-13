#!/bin/bash

data_path="/opt/sca/nginx/certbot"

if [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
    echo "### Creating dhparam file ..."
    openssl dhparam -out $data_path/conf/ssl-dhparams.pem 4096 
fi

if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ]; then
    echo "### Creating options-ssl-nginx.conf file ..."
    cp nginx/certbot/conf/options-ssl-nginx.conf $data_path/conf/options-ssl-nginx.conf
fi