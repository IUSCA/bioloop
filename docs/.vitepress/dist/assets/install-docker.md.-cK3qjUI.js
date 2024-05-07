import{_ as e,c as a,o as s,V as t}from"./chunks/framework.MXVb71fM.js";const m=JSON.parse('{"title":"Run via docker","description":"","frontmatter":{},"headers":[],"relativePath":"install-docker.md","filePath":"install-docker.md"}'),o={name:"install-docker.md"},n=t(`<h1 id="run-via-docker" tabindex="-1">Run via docker <a class="header-anchor" href="#run-via-docker" aria-label="Permalink to &quot;Run via docker&quot;">​</a></h1><p>Docker standardizes the server environment and makes it easier to get a local development environment set up and running.</p><h2 id="setup" tabindex="-1">Setup <a class="header-anchor" href="#setup" aria-label="Permalink to &quot;Setup&quot;">​</a></h2><p>Requires <code>docker</code>. Docker desktop should work too.</p><p>For development purposes, shared volumes are used in <code>docker-compose.yml</code> to ensure container <code>node_modules</code> are not confused with host level <code>node_modules</code>. This approach also keeps <code>node_modules</code> folders out of the local directory to make it easier to <code>find</code> and <code>grep</code>.</p><p>To make adjustments to the way the application runs, edit and review <a href="docker-compose.yml">docker-compose.yml</a>.</p><p>The UI and API containers have been set to run on start up to install / update dependencies.</p><p>Set up the <a href="/bioloop/docs/ui/">front-end ui client</a> or <a href="/bioloop/docs/api/">back-end api server</a> as needed.</p><h3 id="env-files" tabindex="-1">.env files <a class="header-anchor" href="#env-files" aria-label="Permalink to &quot;.env files&quot;">​</a></h3><p><code>ui/</code>, <code>api/</code> and <code>workers/</code> all contain <code>.env.example</code> files. Copy these to a corresponding <code>.env</code> file and update values accordingly.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>cp ui/.env.example ui/.env</span></span>
<span class="line"><span>cp api/.env.example api/.env</span></span>
<span class="line"><span>cp workers/.env.example workers/.env</span></span></code></pre></div><h3 id="openssl" tabindex="-1">OpenSSL <a class="header-anchor" href="#openssl" aria-label="Permalink to &quot;OpenSSL&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>cd ui/</span></span>
<span class="line"><span>mkdir .cert</span></span>
<span class="line"><span>openssl req -subj &#39;/CN=localhost&#39; -x509 -newkey rsa:4096 -nodes -keyout ./.cert/key.pem -out ./.cert/cert.pem</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>cd api/keys</span></span>
<span class="line"><span>./genkeys.sh</span></span></code></pre></div><blockquote><p>Note: when running under Windows, it may be necessary to run the openssl commands via Cygwin</p></blockquote><h2 id="setup-migration-and-seed-database" tabindex="-1">Setup Migration and Seed Database <a class="header-anchor" href="#setup-migration-and-seed-database" aria-label="Permalink to &quot;Setup Migration and Seed Database&quot;">​</a></h2><p>Run the initial migration:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>docker compose exec api bash</span></span>
<span class="line"><span>npx prisma migrate dev</span></span></code></pre></div><p>Add any usernames you need to work with in <code>api/prisma/data.js</code> then seed the db:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>npx prisma db seed</span></span></code></pre></div><h2 id="starting-stopping" tabindex="-1">Starting / Stopping <a class="header-anchor" href="#starting-stopping" aria-label="Permalink to &quot;Starting / Stopping&quot;">​</a></h2><p>Use Docker Compose</p><p>Bring up the containers:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>docker compose up -d</span></span></code></pre></div><p>Make sure everything is running (no Exit 1 States):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>docker compose ps</span></span></code></pre></div><p>To shut down the containers:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>docker compose down -v</span></span></code></pre></div><p>To see what is going on in a specific container:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>docker compose logs -f api</span></span></code></pre></div><h2 id="linting" tabindex="-1">Linting <a class="header-anchor" href="#linting" aria-label="Permalink to &quot;Linting&quot;">​</a></h2><p>To use linting with the docker setup you must have the dev dependencies of the api and ui installed locally as well as the VSCode extention ESLint (dbaeumer.vscode-eslint). You will need to run the install command for both api and ui:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>npm install --save-dev</span></span></code></pre></div><p>You can also install Dev Containers (ms-vscode-remote.remote-containers) to remote into both the api and ui containers separately. You&#39;d have to have two instances of vscode running, but if you don&#39;t want to install dependencies locally this is the best way to run with automatic linting.</p><h2 id="testing" tabindex="-1">Testing <a class="header-anchor" href="#testing" aria-label="Permalink to &quot;Testing&quot;">​</a></h2><p>Try it out how it is. Open a browser and go to:</p><p><a href="https://localhost" target="_blank" rel="noreferrer">https://localhost</a></p><p>You may need to specify the <code>https://</code> prefix manually. You may also have to accept a warning about an insecure connection since it&#39;s a self-signed certificate. The default configuration should be enough to get up and running.</p><p>Test the API with:</p><p><a href="http://127.0.0.1:3030/health" target="_blank" rel="noreferrer">http://127.0.0.1:3030/health</a></p><p>To make more complex requests, use an API development tool like Hoppscotch or Insomnia:</p><p><a href="https://hoppscotch.io/" target="_blank" rel="noreferrer">https://hoppscotch.io/</a></p><p>To POST a request, choose <code>POST</code>, specify the URL, and in <code>Body</code> choose <code>application/x-www-form-urlencoded</code> for the <code>Content Type</code></p><h2 id="queue" tabindex="-1">Queue <a class="header-anchor" href="#queue" aria-label="Permalink to &quot;Queue&quot;">​</a></h2><p>This application makes use of the <a href="https://github.com/IUSCA/rhythm_api" target="_blank" rel="noreferrer">Rhythm API</a> for managing worker queues.</p><p>Queue folders need to belong to docker group</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>db/queue/</span></span>
<span class="line"><span>chown -R \${USER}:docker db/queue/</span></span></code></pre></div><h2 id="quick-start" tabindex="-1">Quick start <a class="header-anchor" href="#quick-start" aria-label="Permalink to &quot;Quick start&quot;">​</a></h2><p>Getting the user permissions set correctly is an important step in making the application run.</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bin/dev.sh</span></span></code></pre></div><p>Run this script from the project root.</p><ul><li>It creates a <code>.env</code> file in the project root which has the user id (uid) and group id (gid) of the project root directory&#39;s owner. The processes inside the api and worker_api docker containers are run as a user with this UID and GID.</li><li>It builds both the api and worker_api images</li><li>It runs all the containers (ui, api, worker_api, queue, postgres, mongo_db)</li></ul><h2 id="troubleshooting" tabindex="-1">Troubleshooting <a class="header-anchor" href="#troubleshooting" aria-label="Permalink to &quot;Troubleshooting&quot;">​</a></h2><p>Most containers have <code>curl</code> available. Connect to one and then try making requests to the service you&#39;re having issue with.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>docker compose exec web bash</span></span>
<span class="line"><span>curl -X GET http://api:3030/</span></span></code></pre></div><p>(in this case, we don&#39;t need the <code>/api</code> suffix since we&#39;re behind the nginx proxy that normally adds <code>/api</code> for us)</p><p>Also, you can always insert <code>console.log()</code> statements in the code to see what values are at any given point.</p><p>You can check which ports are available locally and find something unique.</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>netstat -panl | grep &quot; LISTEN &quot;</span></span></code></pre></div><h2 id="docker-compose" tabindex="-1">Docker-compose <a class="header-anchor" href="#docker-compose" aria-label="Permalink to &quot;Docker-compose&quot;">​</a></h2><h3 id="f" tabindex="-1">-f <a class="header-anchor" href="#f" aria-label="Permalink to &quot;-f&quot;">​</a></h3><p>If you have a compose file named something other than <code>docker-compose.yml</code>, you can specify the name with a <code>-f</code> flag:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>docker compose -f docker-compose-prod.yml up -d</span></span></code></pre></div><h2 id="tip-shortcuts" tabindex="-1">TIP: Shortcuts <a class="header-anchor" href="#tip-shortcuts" aria-label="Permalink to &quot;TIP: Shortcuts&quot;">​</a></h2><p>Create bash aliases</p><p>The above commands can get tiring to type every time you want to take action with a compose environment. These shortcuts help.</p><p>Add the following to your .bashrc file (or equivalent)</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span>alias dcu=&#39;docker compose up -d&#39;</span></span>
<span class="line"><span>alias dcd=&#39;docker compose down --remove-orphans&#39;</span></span>
<span class="line"><span>alias dcp=&#39;docker compose ps&#39;</span></span>
<span class="line"><span>alias dce=&#39;docker compose exec&#39;</span></span>
<span class="line"><span>alias dcl=&#39;docker compose logs&#39;</span></span></code></pre></div><p>via <a href="https://charlesbrandt.com/system/virtualization/docker-compose.html#shell-shortcuts" target="_blank" rel="noreferrer">https://charlesbrandt.com/system/virtualization/docker-compose.html#shell-shortcuts</a></p>`,69),i=[n];function p(c,l,d,r,h,u){return s(),a("div",null,i)}const k=e(o,[["render",p]]);export{m as __pageData,k as default};
