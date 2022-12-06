# Project lifecycle

## Getting started

- Find and replace all instances of `gpdb` to your project name.
  From there, search for `gpdb-` to see other common terms related to the project

- Update the default path in containers
  `/opt/sca/` is used as the default root path, but it's easy to find and replace if you prefer something else like `/srv`

- Check out the latest copies of your preferred frameworks
  No need to include these in this repo  
  It's always good to grab the latest and greatest

```
cd ui
git clone --depth 1 https://github.com/m0ksem/vite-vuestic-tailwind-template.git vvtt
# manually merge in differences
  - delete .vscode, .gitignore, vite.config.ts (local versions are more developed)
  - merge in content from package.json (then delete)

mkdir .cert
openssl req -subj '/CN=localhost' -x509 -newkey rsa:4096 -nodes -keyout ./.cert/key.pem -out ./.cert/cert.pem 

git clone --depth 1 https://github.com/antfu/vitesse.git .
rm -r .git
```

Move in original code and components 
(hopefully they'll still work as expected)

Add in component library of choice


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