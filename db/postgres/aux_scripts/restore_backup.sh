#!/bin/bash

BACKUP_FILE=$1

psql --username=$POSTGRES_USER --dbname=$POSTGRES_DB  -f $BACKUP_FILE