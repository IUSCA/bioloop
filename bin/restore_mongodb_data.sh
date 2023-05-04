#!/bin/bash

# Read Password
echo -n Password: 
read -s password
echo

percent_encoded_password=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" $password)

# URI
URI="mongodb://dgl:$percent_encoded_password@commons3.sca.iu.edu:27017/dgl-test?authSource=dgl-test"


mongoimport \
    --uri "$URI" \
    --collection celery_taskmeta \
    --file celery_taskmeta.json

mongoimport \
    --uri "$URI" \
    --collection workflow_meta \
    --file workflow_meta.json