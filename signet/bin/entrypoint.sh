#!/bin/bash

if [ -f "keys/auth.key" ] && [ -f "keys/auth.pub" ]; then 
  echo "Keys already exist. Skipping key generation."
else
  cd keys/
  ./genkeys.sh
  cd ../
fi


$*