#!/bin/bash

if [ -f keys/auth.pub ] && [ -f keys/auth.key ]; then
  echo "Keys not found. Generating keys..."
  cd keys && ./genkeys.sh 
  cd .. 
else
  echo "Keys already exist. Skipping key generation." 
fi


npx prisma generate 
npm run start