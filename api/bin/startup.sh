#!/bin/bash

if [ -f keys/auth.pub ] && [ -f keys/auth.key ]; then
  echo "Keys already exist. Skipping key generation." 
else
  echo "Keys not found. Generating keys..."
  cd keys 
  openssl genrsa -out auth.key 2048
  chmod 600 auth.key
  openssl rsa -in auth.key -pubout > auth.pub
  cd .. 
fi


npx prisma generate 
npm run start