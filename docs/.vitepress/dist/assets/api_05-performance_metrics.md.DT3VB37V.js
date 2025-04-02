import{_ as t,c as i,o as a,ag as s}from"./chunks/framework.C9SxlbOG.js";const p=JSON.parse('{"title":"Metrics and Monitoring","description":"","frontmatter":{},"headers":[],"relativePath":"api/05-performance/metrics.md","filePath":"api/05-performance/metrics.md","lastUpdated":null}'),o={name:"api/05-performance/metrics.md"};function r(n,e,l,c,h,d){return a(),i("div",null,e[0]||(e[0]=[s('<h1 id="metrics-and-monitoring" tabindex="-1">Metrics and Monitoring <a class="header-anchor" href="#metrics-and-monitoring" aria-label="Permalink to &quot;Metrics and Monitoring&quot;">​</a></h1><p>This project uses <strong>Prometheus</strong> and <strong>Grafana</strong> for monitoring and visualizing application performance metrics. These tools are essential for understanding system behavior, identifying bottlenecks, and ensuring the application runs smoothly in production.</p><h2 id="prometheus" tabindex="-1">Prometheus <a class="header-anchor" href="#prometheus" aria-label="Permalink to &quot;Prometheus&quot;">​</a></h2><p>Prometheus is a powerful monitoring system that collects and stores metrics from various sources. It is configured to scrape metrics from the following targets:</p><ul><li><strong>Database (Postgres)</strong>: Metrics are exposed via <code>postgres_exporter</code>, which is defined in <code>docker-compose.yml</code>.</li><li><strong>Node.js and Express.js app</strong>: Metrics are exposed via the <code>prom-client</code> library.</li></ul><h3 id="configuration" tabindex="-1">Configuration <a class="header-anchor" href="#configuration" aria-label="Permalink to &quot;Configuration&quot;">​</a></h3><ul><li><strong>Service Definition</strong>: The Prometheus service is defined in <code>docker-compose.yml</code>.</li><li><strong>Configuration File</strong>: Located at <code>metrics/prometheus/config/prometheus.yml</code>.</li></ul><h3 id="without-prometheus" tabindex="-1">Without Prometheus <a class="header-anchor" href="#without-prometheus" aria-label="Permalink to &quot;Without Prometheus&quot;">​</a></h3><p>Without Prometheus, there would be no centralized system to collect and store metrics, making it difficult to monitor application performance or detect issues in real-time.</p><h3 id="integration" tabindex="-1">Integration <a class="header-anchor" href="#integration" aria-label="Permalink to &quot;Integration&quot;">​</a></h3><p>Prometheus runs in the same Docker network as the Node.js app and Postgres database, allowing it to scrape metrics directly from their endpoints.</p><h2 id="grafana" tabindex="-1">Grafana <a class="header-anchor" href="#grafana" aria-label="Permalink to &quot;Grafana&quot;">​</a></h2><p>Grafana is used to visualize the metrics collected by Prometheus. It provides dashboards that make it easy to analyze system performance and identify trends.</p><h3 id="features" tabindex="-1">Features <a class="header-anchor" href="#features" aria-label="Permalink to &quot;Features&quot;">​</a></h3><ul><li><strong>Pre-configured Dashboards</strong>: <ul><li>Node.js app metrics</li><li>Postgres metrics</li></ul></li><li><strong>Datasource</strong>: Automatically configured to use Prometheus as the datasource.</li><li><strong>Access</strong>: Accessible at <code>https://localhost/grafana/</code>. Only users with the admin role can access it.</li></ul><h3 id="configuration-1" tabindex="-1">Configuration <a class="header-anchor" href="#configuration-1" aria-label="Permalink to &quot;Configuration&quot;">​</a></h3><ul><li><strong>Service Definition</strong>: The Grafana service is defined in <code>docker-compose.yml</code>.</li><li><strong>Configuration Files</strong>: <ul><li><code>metrics/grafana/config/grafana.ini</code>: Contains Grafana server and authentication settings.</li><li><code>metrics/grafana/provisioning/datasources</code>: Configures Prometheus as the datasource.</li><li><code>metrics/grafana/provisioning/dashboards</code>: Defines the dashboards to be imported.</li></ul></li></ul><h3 id="authentication-and-authorization" tabindex="-1">Authentication and Authorization <a class="header-anchor" href="#authentication-and-authorization" aria-label="Permalink to &quot;Authentication and Authorization&quot;">​</a></h3><ul><li><strong>JWT Authentication</strong>: Grafana uses JWT tokens for authentication. <ul><li>Admin users receive a secure, HTTPS-only cookie containing the JWT token.</li><li>The reverse proxy forwards this token to Grafana as a header (<code>X-JWT-Assertion</code>).</li></ul></li><li><strong>Reverse Proxy</strong>: <ul><li>In development: Vite is used as the reverse proxy (<code>ui/vite.config.js</code>).</li><li>In production: Nginx is used as the reverse proxy (<code>nginx/conf/app.conf</code>).</li></ul></li></ul><h3 id="integration-1" tabindex="-1">Integration <a class="header-anchor" href="#integration-1" aria-label="Permalink to &quot;Integration&quot;">​</a></h3><p>Grafana is integrated into the same Docker network as Prometheus, ensuring seamless access to metrics.</p><h2 id="how-this-setup-helps" tabindex="-1">How This Setup Helps <a class="header-anchor" href="#how-this-setup-helps" aria-label="Permalink to &quot;How This Setup Helps&quot;">​</a></h2><ul><li><strong>Centralized Monitoring</strong>: Prometheus collects metrics from multiple sources, while Grafana visualizes them in a single interface.</li><li><strong>Maintainability</strong>: The configuration files are modular and well-organized, making it easy to update or extend the setup.</li><li><strong>Real-time Insights</strong>: Developers can monitor application performance in real-time, enabling faster debugging and optimization.</li></ul><h2 id="usage-instructions" tabindex="-1">Usage Instructions <a class="header-anchor" href="#usage-instructions" aria-label="Permalink to &quot;Usage Instructions&quot;">​</a></h2><ol><li><p><strong>Start the Services</strong>: Ensure Docker is running and start the services using:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker-compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> up</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span></span></code></pre></div></li><li><p><strong>View Dashboards</strong>:</p><ul><li>Log into <a href="https://localhost" target="_blank" rel="noreferrer">bioloop</a> with the admin credentials.</li><li>In the sidebar, click on <code>Metrics</code> to access the Grafana dashboards screen.</li><li>Navigate to the pre-configured dashboards for Node.js and Postgres metrics.</li></ul></li><li><p><strong>Add New Metrics</strong>:</p><ul><li>For Node.js: See <a href="./instrumentation.html">Instrumentation</a> to add custom metrics.</li><li>For Postgres: Update the <code>queries.yml</code> file in <code>metrics/postgres_exporter/</code>.</li></ul></li><li><p><strong>Restart Services</strong>: After making changes to configurations, restart the affected services:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker-compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> restart</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">service_nam</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">e</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span></span></code></pre></div></li></ol><p>This setup ensures a robust monitoring system that is easy to maintain and extend as the application grows.</p>',26)]))}const g=t(o,[["render",r]]);export{p as __pageData,g as default};
