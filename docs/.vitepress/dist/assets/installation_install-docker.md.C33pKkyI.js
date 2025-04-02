import{_ as i,c as a,o as e,ag as t}from"./chunks/framework.C9SxlbOG.js";const c=JSON.parse('{"title":"Docker","description":"","frontmatter":{"title":"Docker","order":1},"headers":[],"relativePath":"installation/install-docker.md","filePath":"installation/install-docker.md","lastUpdated":null}'),n={name:"installation/install-docker.md"};function l(h,s,p,k,o,r){return e(),a("div",null,s[0]||(s[0]=[t(`<h1 id="installation-guide" tabindex="-1">Installation Guide <a class="header-anchor" href="#installation-guide" aria-label="Permalink to &quot;Installation Guide&quot;">​</a></h1><p>This guide will help you set up Bioloop using Docker for local development or production deployment.</p><h2 id="prerequisites" tabindex="-1">Prerequisites <a class="header-anchor" href="#prerequisites" aria-label="Permalink to &quot;Prerequisites&quot;">​</a></h2><ul><li>Docker Engine or Docker Desktop</li><li>Node.js 16+ (for local development without Docker)</li><li>OpenSSL (for generating certificates)</li><li>Git (for cloning the repository)</li></ul><h2 id="quick-start" tabindex="-1">Quick Start <a class="header-anchor" href="#quick-start" aria-label="Permalink to &quot;Quick Start&quot;">​</a></h2><ol><li>Clone the repository and navigate to the project directory</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> clone</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://github.com/IUSCA/bioloop.git</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bioloop</span></span></code></pre></div><ol start="2"><li>Set up environment files</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cp</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ui/.env.example</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ui/.env</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cp</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> api/.env.example</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> api/.env</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cp</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> workers/.env.example</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> workers/.env</span></span></code></pre></div><ol start="3"><li>Generate required certificates</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># For UI HTTPS</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ui/</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">mkdir</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .cert</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">openssl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> req</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -subj</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;/CN=localhost&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -x509</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -newkey</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> rsa:4096</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -nodes</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -keyout</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ./.cert/key.pem</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -out</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ./.cert/cert.pem</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> </span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ..</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># For API JWT</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> api/keys</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">./genkeys.sh</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ../..</span></span></code></pre></div><ol start="4"><li>Start the services</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> up</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span></span></code></pre></div><h2 id="development-setup-details" tabindex="-1">Development Setup Details <a class="header-anchor" href="#development-setup-details" aria-label="Permalink to &quot;Development Setup Details&quot;">​</a></h2><p>The project uses Docker Compose for development with some key features:</p><ul><li>Shared volumes for <code>node_modules</code> to avoid conflicts with host</li><li>Hot-reload enabled for UI and API</li><li>Automatic dependency installation on container startup</li><li>PostgreSQL database with automatic migrations</li></ul><h2 id="configuration" tabindex="-1">Configuration <a class="header-anchor" href="#configuration" aria-label="Permalink to &quot;Configuration&quot;">​</a></h2><h3 id="environment-variables" tabindex="-1">Environment Variables <a class="header-anchor" href="#environment-variables" aria-label="Permalink to &quot;Environment Variables&quot;">​</a></h3><p>Each component requires specific environment variables to be set:</p><ul><li><strong>UI</strong>: Authentication endpoints, API URL</li><li><strong>API</strong>: Database connection, JWT secrets</li><li><strong>Workers</strong>: Queue settings, processing parameters</li></ul><p>See the <code>.env.example</code> files in each directory for required variables.</p><h3 id="docker-configuration" tabindex="-1">Docker Configuration <a class="header-anchor" href="#docker-configuration" aria-label="Permalink to &quot;Docker Configuration&quot;">​</a></h3><p>The application behavior can be customized by editing:</p><ul><li><code>docker-compose.yml</code> - Development setup</li><li><code>docker-compose-prod.yml</code> - Production configuration</li></ul><h2 id="database-setup" tabindex="-1">Database Setup <a class="header-anchor" href="#database-setup" aria-label="Permalink to &quot;Database Setup&quot;">​</a></h2><ol><li>Run initial migrations:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> exec</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> api</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bash</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">npx</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prisma</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> migrate</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev</span></span></code></pre></div><ol start="2"><li>Seed the database:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Edit api/prisma/data.js to add required users first</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">npx</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prisma</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> db</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> seed</span></span></code></pre></div><h2 id="common-operations" tabindex="-1">Common Operations <a class="header-anchor" href="#common-operations" aria-label="Permalink to &quot;Common Operations&quot;">​</a></h2><h3 id="starting-services" tabindex="-1">Starting Services <a class="header-anchor" href="#starting-services" aria-label="Permalink to &quot;Starting Services&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> up</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # Start all services</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> up</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ui</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> api</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # Start specific services</span></span></code></pre></div><h3 id="checking-status" tabindex="-1">Checking Status <a class="header-anchor" href="#checking-status" aria-label="Permalink to &quot;Checking Status&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ps</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # List container status</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> logs</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -f</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # Follow all logs</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> logs</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> api</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # View API logs</span></span></code></pre></div><h3 id="stopping-services" tabindex="-1">Stopping Services <a class="header-anchor" href="#stopping-services" aria-label="Permalink to &quot;Stopping Services&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> down</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # Stop and remove containers</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> down</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -v</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # Also remove volumes</span></span></code></pre></div><h2 id="development-tools" tabindex="-1">Development Tools <a class="header-anchor" href="#development-tools" aria-label="Permalink to &quot;Development Tools&quot;">​</a></h2><h3 id="code-linting" tabindex="-1">Code Linting <a class="header-anchor" href="#code-linting" aria-label="Permalink to &quot;Code Linting&quot;">​</a></h3><p>Two options for ESLint integration:</p><ol><li>Local Installation:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Install dev dependencies locally</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> api</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;&amp; </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">npm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --save-dev</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ../ui</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;&amp; </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">npm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --save-dev</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Install VSCode ESLint extension</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">code</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --install-extension</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dbaeumer.vscode-eslint</span></span></code></pre></div><ol start="2"><li>Using Dev Containers:</li></ol><ul><li>Install VSCode Dev Containers extension</li><li>Open API and UI folders in separate VSCode windows</li><li>Reopen in container when prompted</li></ul><h3 id="testing" tabindex="-1">Testing <a class="header-anchor" href="#testing" aria-label="Permalink to &quot;Testing&quot;">​</a></h3><ol><li>UI Testing:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Access the UI</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">open</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://localhost</span></span></code></pre></div><p>Note: Accept the self-signed certificate warning</p><ol start="2"><li>API Testing:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Check API health</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> http://127.0.0.1:3030/health</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># For complex API testing, use:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">-</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Hoppscotch</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (https://hoppscotch.io)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">-</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Insomnia</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">-</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Postman</span></span></code></pre></div><h2 id="queue-system" tabindex="-1">Queue System <a class="header-anchor" href="#queue-system" aria-label="Permalink to &quot;Queue System&quot;">​</a></h2><p>The application uses <a href="https://github.com/IUSCA/rhythm_api" target="_blank" rel="noreferrer">Rhythm API</a> for task queues.</p><p>Setup queue permissions:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> chown</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -R</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> \${USER}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">:docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> db/queue/</span></span></code></pre></div><h2 id="troubleshooting-guide" tabindex="-1">Troubleshooting Guide <a class="header-anchor" href="#troubleshooting-guide" aria-label="Permalink to &quot;Troubleshooting Guide&quot;">​</a></h2><h3 id="common-issues" tabindex="-1">Common Issues <a class="header-anchor" href="#common-issues" aria-label="Permalink to &quot;Common Issues&quot;">​</a></h3><ol><li>Container Access:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> exec</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> web</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bash</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -X</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> GET</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> http://api:3030/</span></span></code></pre></div><ol start="2"><li>Port Conflicts:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">netstat</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -panl</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> grep</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot; LISTEN &quot;</span></span></code></pre></div><ol start="3"><li>Logs:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> logs</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> service_name</span></span></code></pre></div><h3 id="development-tips" tabindex="-1">Development Tips <a class="header-anchor" href="#development-tips" aria-label="Permalink to &quot;Development Tips&quot;">​</a></h3><ol><li>Use the quick start script:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bin/dev.sh</span></span></code></pre></div><p>This handles:</p><ul><li>User permissions setup</li><li>Image building</li><li>Container orchestration</li></ul><ol start="2"><li>Useful Docker Compose Aliases:</li></ol><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Add to ~/.bashrc</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> dcu</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;docker compose up -d&#39;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> dcd</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;docker compose down --remove-orphans&#39;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> dcp</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;docker compose ps&#39;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> dce</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;docker compose exec&#39;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> dcl</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;docker compose logs&#39;</span></span></code></pre></div>`,68)]))}const g=i(n,[["render",l]]);export{c as __pageData,g as default};
