import{_ as s,c as i,o as e,V as a}from"./chunks/framework.Thz6RzJC.js";const u=JSON.parse('{"title":"Workers","description":"","frontmatter":{},"headers":[],"relativePath":"worker/index.md","filePath":"worker/index.md"}'),t={name:"worker/index.md"},l=a(`<h1 id="workers" tabindex="-1">Workers <a class="header-anchor" href="#workers" aria-label="Permalink to &quot;Workers&quot;">​</a></h1><h2 id="coding-guidelines" tabindex="-1">Coding Guidelines <a class="header-anchor" href="#coding-guidelines" aria-label="Permalink to &quot;Coding Guidelines&quot;">​</a></h2><h3 id="hierarchical-config" tabindex="-1">Hierarchical Config <a class="header-anchor" href="#hierarchical-config" aria-label="Permalink to &quot;Hierarchical Config&quot;">​</a></h3><ul><li>The default &amp; dev config goes into <code>workers/config/common.py</code></li><li>The overrides for production goes into <code>workers/config/production.py</code></li><li>Based on the environment variable APP_ENV, config from that file is imported and merged with the common config. <ul><li>Add APP_ENV=production to <code>.env</code> file which load_dotenv reads or</li><li>directly set it as <code>export APP_ENV=production</code>.</li></ul></li><li>In project files, import config as <code>from workers.config import config</code></li><li>Imported config is a <a href="https://pypi.org/project/dotmap/" target="_blank" rel="noreferrer">DotMap</a> object, which supports both <code>config[]</code> and <code>config.</code> access.</li><li>To add a new environment (for example &quot;stage&quot;), create a new file inside <code>workers/config</code> called <code>stage.py</code> and have the overriding config as a dict assigned to a variable named <code>config</code>.</li></ul><h3 id="celery-config" tabindex="-1">Celery config <a class="header-anchor" href="#celery-config" aria-label="Permalink to &quot;Celery config&quot;">​</a></h3><ul><li>config specific to Celery is in <code>workers/config/celeryconfig.py</code></li><li>Config is in python values, instead of a dict</li><li>Env specific values and secrets are loaded from <code>.env</code> file</li></ul><h3 id="code-organization" tabindex="-1">Code Organization <a class="header-anchor" href="#code-organization" aria-label="Permalink to &quot;Code Organization&quot;">​</a></h3><ul><li>Celery Tasks: <code>workers/tasks/*.py</code></li><li>Scheduled job and other scripts: <code>workers/scripts/*.py</code></li><li>Helper code: <code>workers/*.py</code></li><li>Config / settings are in <code>workers/config/*.py</code> and <code>.env</code></li><li>Test code is in <code>tests/</code></li></ul><h3 id="hot-module-replacement" tabindex="-1">Hot Module Replacement <a class="header-anchor" href="#hot-module-replacement" aria-label="Permalink to &quot;Hot Module Replacement&quot;">​</a></h3><p>Worker automatically run with updated code except for the code in</p><ul><li>workers.config.*</li><li>workers.utils</li><li>workers.celery_app</li><li>workers.task.declaration</li></ul><h2 id="deployment" tabindex="-1">Deployment <a class="header-anchor" href="#deployment" aria-label="Permalink to &quot;Deployment&quot;">​</a></h2><ul><li>Add <code>module load python/3.10.5</code> to ~/.modules</li><li>Update <code>.env</code> (make a copy of <code>.env.example</code> and add values)</li><li>Install dependencies</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">poetry</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> export --without-hashes --format=requirements.txt</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> requirements.txt</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pip</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install -r requirements.txt</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/app/workers</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pm2</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> start ecosystem.config.js</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># optional</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pm2</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> save</span></span></code></pre></div><h2 id="testing-with-workers-running-on-local-machine" tabindex="-1">Testing with workers running on local machine <a class="header-anchor" href="#testing-with-workers-running-on-local-machine" aria-label="Permalink to &quot;Testing with workers running on local machine&quot;">​</a></h2><p>Start mongo and queue</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">rhythm_ap</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">i</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker-compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> up queue mongo -d</span></span></code></pre></div><p>Start Workers</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">python</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> celery -A tests.celery_app worker --loglevel INFO -O fair --pidfile celery_worker.pid --hostname &#39;bioloop-celery-w1@%h&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --autoscale=2,1</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --queues</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;bioloop-dev.sca.iu.edu.q&#39;</span></span></code></pre></div><p><code>--concurrency 1</code>: number of worker processed to pre-fork</p><p><code>-O fair</code>: Optimization profile, disables prefetching of tasks. Guarantees child processes will only be allocated tasks when they are actually available.</p><p>Use <code>--hostname &#39;&lt;app_name&gt;-celery-&lt;worker_name&gt;@%h&#39;</code> to distinguish multiple workers running on the same machine either for the same app or different apps.</p><ul><li>replace <code>&lt;app_name&gt;</code> with app name (ex: bioloop)</li><li>replace <code>&lt;worker_name&gt;</code> with worker name (ex: w1)</li></ul><p>Auto-scaling - max_concurrency,min_concurrency <code>--autoscale=10,3</code> (always keep 3 processes, but grow to 10 if necessary).</p><p><code>--queues &#39;&lt;app_name&gt;-dev.sca.iu.edu&#39;</code> comma separated queue names. worker will subscribe to these queues for accepting tasks. Configured in <code>workers/config/celeryconfig.py</code> with <code>task_routes</code>, <code>task_default_queue</code></p><p>Run test</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">python</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tests.test</span></span></code></pre></div><h2 id="testing-with-workers-running-on-colo-node-and-rhythm-api" tabindex="-1">Testing with workers running on COLO node and Rhythm API <a class="header-anchor" href="#testing-with-workers-running-on-colo-node-and-rhythm-api" aria-label="Permalink to &quot;Testing with workers running on COLO node and Rhythm API&quot;">​</a></h2><p>There are no test instances of API, rhythm_api, mongo, postgres, queue running. These need to be run in local and port forwarded through ssh.</p><ul><li>start postgres locally using docker</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">app_nam</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">e</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker-compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> up postgres -d</span></span></code></pre></div><ul><li>start rhythm_api locally</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">rhythm_ap</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">i</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker-compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> up queue mongo -d</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">poetry</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run dev</span></span></code></pre></div><ul><li>start UI and API locally</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">app_nam</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">e</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/api</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pnpm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> start</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">app_nam</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">e</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/ui</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pnpm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev</span></span></code></pre></div><ul><li>Reverse port forward API, mongo and queue. let the clients on remote machine talk to a server running on the local machine. <ul><li>API - local port - 3030, remote port - 3130</li><li>Mongo - local port - 27017, remote port - 28017</li><li>queue - local port - 5672, remote port - 5772</li></ul></li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ssh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  -A</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  -R</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3130</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">:localhost:3030 </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  -R</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 28017</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">:localhost:27017 </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  -R</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 5772</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">:localhost:5672 </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  bioloopuser@workers.iu.edu</span></span></code></pre></div><ul><li>pull latest changes in dev branch to <code>&lt;bioloop_dev&gt;</code></li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">colo23&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cd </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">app_de</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">v</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">colo23&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> git checkout dev</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">colo23&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> git pull</span></span></code></pre></div><ul><li><p>create / update <code>&lt;app_dev&gt;/workers/.env</code></p></li><li><p>create an auth token to communicate with the express server (postgres db)</p><ul><li><code>cd &lt;app&gt;/api</code></li><li><code>node src/scripts/issue_token.js &lt;service_account&gt;</code></li><li>ex: <code>node src/scripts/issue_token.js svc_tasks</code></li><li>docker ex: <code>sudo docker compose -f &quot;docker-compose-prod.yml&quot; exec api node src/scripts/issue_token.js svc_tasks</code></li></ul></li><li><p>install dependencies using poetry and start celery workers</p></li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">colo23&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cd workers</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">colo23&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> poetry install</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">colo23&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> poetry shell</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">colo23&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> python -m celery -A workers.celery_app worker --loglevel INFO -O fair --pidfile celery_worker.pid --hostname &#39;bioloop-dev-celery-w1@%h&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --autoscale=2,1</span></span></code></pre></div><p>Dataset Name:</p><ul><li>taken from the name of the directory ingested</li><li>used in watch.py to filter out registered datasets</li><li>used to compute the staging path <code>staging_dir / alias / dataset[&#39;name&#39;]</code></li><li>used to compute the qc path <code>Path(config[&#39;paths&#39;][dataset_type][&#39;qc&#39;]) / dataset[&#39;name&#39;] / &#39;qc&#39;</code></li><li>used to compute the scratch tar path while downloading the tar file from SDA <code>Path(f&#39;{str(compute_staging_path(dataset)[0].parent)}/{dataset[&quot;name&quot;]}.tar&#39;)</code></li></ul>`,45),n=[l];function o(p,h,r,d,c,k){return e(),i("div",null,n)}const F=s(t,[["render",o]]);export{u as __pageData,F as default};
