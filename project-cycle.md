# Project lifecycle

## Local Templating

```
npm i -g hygen
hygen init self
hygen init repo
cat _templates/init/repo/new-repo.ejs.t 
ls -al
cat README.md 
ls -al _templates/
ls -al _templates/generator/
ls -al _templates/init/
history | cut -c 8-
```

http://www.hygen.io/docs/quick-start/

```
hygen init repo antfu/vitesse --to my-folder
```

https://github.com/jondot/hygen/

## Deployment Checklist

Check for and disable exposed ports
  - all ports should work within the local docker network

Update CAS destination to production

Update database configuration

Ensure webserver is using `ui/dist` built version