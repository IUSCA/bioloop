#!/bin/bash

# Check if keys exists
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

# Check if node_modules exists and is empty
if [ -d "node_modules" ] && [ "$(ls -A node_modules)" ]; then
  echo "node_modules already exists and is not empty. Skipping npm install."
else
  echo "node_modules not found or empty. Running npm install..."
  npm install
fi



# Generate Prisma client
npx prisma generate 

# Run database migrations
npx prisma migrate deploy

# Run the application
$*
