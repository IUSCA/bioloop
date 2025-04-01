# Metrics and Monitoring

This project uses **Prometheus** and **Grafana** for monitoring and visualizing application performance metrics. These tools are essential for understanding system behavior, identifying bottlenecks, and ensuring the application runs smoothly in production.

## Prometheus

Prometheus is a powerful monitoring system that collects and stores metrics from various sources. It is configured to scrape metrics from the following targets:

- **Database (Postgres)**: Metrics are exposed via `postgres_exporter`, which is defined in `docker-compose.yml`.
- **Node.js and Express.js app**: Metrics are exposed via the `prom-client` library.

### Configuration
- **Service Definition**: The Prometheus service is defined in `docker-compose.yml`.
- **Configuration File**: Located at `metrics/prometheus/config/prometheus.yml`.

### Without Prometheus
Without Prometheus, there would be no centralized system to collect and store metrics, making it difficult to monitor application performance or detect issues in real-time.

### Integration
Prometheus runs in the same Docker network as the Node.js app and Postgres database, allowing it to scrape metrics directly from their endpoints.



## Grafana

Grafana is used to visualize the metrics collected by Prometheus. It provides dashboards that make it easy to analyze system performance and identify trends.

### Features
- **Pre-configured Dashboards**: 
  - Node.js app metrics
  - Postgres metrics
- **Datasource**: Automatically configured to use Prometheus as the datasource.
- **Access**: Accessible at `https://localhost/grafana/`. Only users with the admin role can access it.

### Configuration
- **Service Definition**: The Grafana service is defined in `docker-compose.yml`.
- **Configuration Files**:
  - `metrics/grafana/config/grafana.ini`: Contains Grafana server and authentication settings.
  - `metrics/grafana/provisioning/datasources`: Configures Prometheus as the datasource.
  - `metrics/grafana/provisioning/dashboards`: Defines the dashboards to be imported.

### Authentication and Authorization
- **JWT Authentication**: Grafana uses JWT tokens for authentication.
  - Admin users receive a secure, HTTPS-only cookie containing the JWT token.
  - The reverse proxy forwards this token to Grafana as a header (`X-JWT-Assertion`).
- **Reverse Proxy**:
  - In development: Vite is used as the reverse proxy (`ui/vite.config.js`).
  - In production: Nginx is used as the reverse proxy (`nginx/conf/app.conf`).

### Integration
Grafana is integrated into the same Docker network as Prometheus, ensuring seamless access to metrics.



## How This Setup Helps

- **Centralized Monitoring**: Prometheus collects metrics from multiple sources, while Grafana visualizes them in a single interface.
- **Maintainability**: The configuration files are modular and well-organized, making it easy to update or extend the setup.
- **Real-time Insights**: Developers can monitor application performance in real-time, enabling faster debugging and optimization.



## Usage Instructions

1. **Start the Services**:
   Ensure Docker is running and start the services using:
   ```bash
   docker-compose up -d
   ```

2. **View Dashboards**:
   - Log into [bioloop](https://localhost) with the admin credentials.
   - In the sidebar, click on `Metrics` to access the Grafana dashboards screen.
   - Navigate to the pre-configured dashboards for Node.js and Postgres metrics.

3. **Add New Metrics**:
   - For Node.js: See [Instrumentation](instrumentation.md) to add custom metrics.
   - For Postgres: Update the `queries.yml` file in `metrics/postgres_exporter/`.

4. **Restart Services**:
   After making changes to configurations, restart the affected services:
   ```bash
   docker-compose restart <service_name>
   ```

This setup ensures a robust monitoring system that is easy to maintain and extend as the application grows.


