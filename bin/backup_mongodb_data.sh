#!/bin/bash



# Read Password
echo -n Password: 
read -s password
echo

percent_encoded_password=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" $password)

# URI
URI="mongodb://dgl:$percent_encoded_password@commons3.sca.iu.edu:27017/dgl-test?authSource=dgl-test"

mongoexport \
    --uri="$URI" \
    --collection="celery_taskmeta" \
    --out="celery_taskmeta.json"

mongoexport \
    --uri="$URI" \
    --collection="workflow_meta" \
    --out="workflow_meta.json"