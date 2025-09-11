#!/bin/bash

# Check if .cert directory exists
if [ ! -d ".cert" ]; then
  mkdir .cert
fi

# Check if certs exists
if [ -f .cert/cert.pem ] && [ -f .cert/key.pem ]; then
  echo "Certs already exist. Skipping cert generation." 
else
  echo "Certs not found. Generating Certs..."
  cd .cert

  # Generate a self-signed certificate
  openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=US/ST=IN/L=Bloomington/O=IU/OU=SCA/CN=localhost"
fi

# Install dependencies
npm install

$*