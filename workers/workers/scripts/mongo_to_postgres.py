import html
import json
from datetime import datetime

import pymongo
import psycopg2


class MongoToPostgresConversionManager:
    def __init__(self, mongo_conn_string, pg_conn_string):
        # MongoDB connection
        self.mongo_client = pymongo.MongoClient(mongo_conn_string)
        self.mongo_db = self.mongo_client["cmg_database"]

        #  connection
        self.postgres_conn = psycopg2.connect(**self.parse_conn_string(pg_conn_string))

    @staticmethod
    def parse_conn_string(conn_string):
        parts = conn_string.split('//')[1].split('@')
        user_pass, host_port_db = parts[0], parts[1]
        username, password = user_pass.split(':')
        host, port_db = host_port_db.split(':')
        port, dbname = port_db.split('/')
        return {
            "dbname": dbname,
            "user": username,
            "password": password,
            "host": host,
            "port": port
        }

    def create_tables(self, cur):
        cur.execute("""
        -- Create enum types
            CREATE TYPE access_type AS ENUM ('BROWSER', 'SLATE_SCRATCH');
            CREATE TYPE NOTIFICATION_STATUS AS ENUM ('CREATED', 'ACKNOWLEDGED', 'RESOLVED');
            CREATE TYPE upload_status AS ENUM ('UPLOADING', 'UPLOAD_FAILED', 'UPLOADED', 'PROCESSING', 'PROCESSING_FAILED', 'COMPLETE', 'FAILED');
            
            -- Create tables
            CREATE TABLE "dataset" (
              "id" SERIAL PRIMARY KEY,
              "name" TEXT NOT NULL,
              "type" TEXT NOT NULL,
              "num_directories" INTEGER,
              "num_files" INTEGER,
              "du_size" BIGINT,
              "size" BIGINT,
              "bundle_size" BIGINT,
              "description" TEXT,
              "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "origin_path" TEXT,
              "archive_path" TEXT,
              "staged_path" TEXT,
              "is_deleted" BOOLEAN NOT NULL DEFAULT false,
              "is_staged" BOOLEAN NOT NULL DEFAULT false,
              "metadata" JSONB,
              UNIQUE ("name", "type", "is_deleted")
            );
            
            CREATE TABLE "dataset_hierarchy" (
              "source_id" INTEGER NOT NULL,
              "derived_id" INTEGER NOT NULL,
              "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY ("source_id", "derived_id"),
              FOREIGN KEY ("source_id") REFERENCES "dataset"("id") ON DELETE CASCADE,
              FOREIGN KEY ("derived_id") REFERENCES "dataset"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "dataset_file" (
              "id" SERIAL PRIMARY KEY,
              "name" TEXT,
              "path" TEXT NOT NULL,
              "md5" TEXT,
              "size" BIGINT,
              "filetype" TEXT,
              "metadata" JSONB,
              "status" TEXT,
              "dataset_id" INTEGER NOT NULL,
              FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE,
              UNIQUE ("path", "dataset_id")
            );
            
            CREATE INDEX ON "dataset_file" ("dataset_id");
            
            CREATE TABLE "dataset_file_hierarchy" (
              "parent_id" INTEGER NOT NULL,
              "child_id" INTEGER NOT NULL,
              PRIMARY KEY ("parent_id", "child_id"),
              FOREIGN KEY ("parent_id") REFERENCES "dataset_file"("id") ON DELETE CASCADE,
              FOREIGN KEY ("child_id") REFERENCES "dataset_file"("id") ON DELETE CASCADE
            );
            
            CREATE INDEX ON "dataset_file_hierarchy" ("child_id");
            
            CREATE TABLE "upload_log" (
              "id" SERIAL PRIMARY KEY,
              "status" upload_status NOT NULL,
              "initiated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "user_id" INTEGER NOT NULL,
              FOREIGN KEY ("user_id") REFERENCES "user"("id")
            );
            
            CREATE TABLE "dataset_upload_log" (
              "id" SERIAL PRIMARY KEY,
              "dataset_id" INTEGER UNIQUE NOT NULL,
              "upload_log_id" INTEGER UNIQUE NOT NULL,
              FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE,
              FOREIGN KEY ("upload_log_id") REFERENCES "upload_log"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "file_upload_log" (
              "id" SERIAL PRIMARY KEY,
              "name" TEXT NOT NULL,
              "md5" TEXT NOT NULL,
              "num_chunks" INTEGER NOT NULL,
              "status" upload_status NOT NULL,
              "path" TEXT,
              "upload_log_id" INTEGER,
              FOREIGN KEY ("upload_log_id") REFERENCES "upload_log"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "dataset_audit" (
              "id" SERIAL PRIMARY KEY,
              "action" TEXT NOT NULL,
              "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "old_data" JSONB,
              "new_data" JSONB,
              "user_id" INTEGER,
              "dataset_id" INTEGER,
              FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
              FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "dataset_state" (
              "state" TEXT NOT NULL,
              "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "metadata" JSONB,
              "dataset_id" INTEGER NOT NULL,
              PRIMARY KEY ("timestamp", "dataset_id", "state"),
              FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "bundle" (
              "id" SERIAL PRIMARY KEY,
              "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "name" TEXT NOT NULL,
              "size" BIGINT,
              "md5" TEXT NOT NULL,
              "dataset_id" INTEGER UNIQUE NOT NULL,
              FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "data_access_log" (
              "id" SERIAL PRIMARY KEY,
              "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "access_type" access_type NOT NULL,
              "file_id" INTEGER,
              "dataset_id" INTEGER,
              "user_id" INTEGER NOT NULL,
              FOREIGN KEY ("file_id") REFERENCES "dataset_file"("id"),
              FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id"),
              FOREIGN KEY ("user_id") REFERENCES "user"("id")
            );
            
            CREATE TABLE "stage_request_log" (
              "id" SERIAL PRIMARY KEY,
              "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "dataset_id" INTEGER,
              "user_id" INTEGER NOT NULL,
              FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id"),
              FOREIGN KEY ("user_id") REFERENCES "user"("id")
            );
            
            CREATE TABLE "user" (
              "id" SERIAL PRIMARY KEY,
              "username" VARCHAR(100) UNIQUE NOT NULL,
              "name" VARCHAR(100),
              "email" VARCHAR(100) UNIQUE NOT NULL,
              "cas_id" VARCHAR(100) UNIQUE,
              "notes" TEXT,
              "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "is_deleted" BOOLEAN NOT NULL DEFAULT false
            );
            
            CREATE TABLE "user_password" (
              "id" SERIAL PRIMARY KEY,
              "password" VARCHAR(100) NOT NULL,
              "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "user_id" INTEGER UNIQUE NOT NULL,
              FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "user_login" (
              "id" SERIAL PRIMARY KEY,
              "last_login" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "method" TEXT NOT NULL,
              "user_id" INTEGER UNIQUE NOT NULL,
              FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "user_settings" (
              "id" SERIAL PRIMARY KEY,
              "user_id" INTEGER UNIQUE NOT NULL,
              "settings" JSONB NOT NULL,
              FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "notification" (
              "id" SERIAL PRIMARY KEY,
              "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "label" TEXT NOT NULL,
              "text" TEXT,
              "status" NOTIFICATION_STATUS NOT NULL DEFAULT 'CREATED',
              "acknowledged_by_id" INTEGER,
              FOREIGN KEY ("acknowledged_by_id") REFERENCES "user"("id")
            );
            
            CREATE TABLE "role_notification" (
              "id" SERIAL PRIMARY KEY,
              "role_id" INTEGER NOT NULL,
              "notification_id" INTEGER NOT NULL,
              UNIQUE ("notification_id", "role_id"),
              FOREIGN KEY ("role_id") REFERENCES "role"("id"),
              FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "user_notification" (
              "id" SERIAL PRIMARY KEY,
              "user_id" INTEGER NOT NULL,
              "notification_id" INTEGER NOT NULL,
              UNIQUE ("notification_id", "user_id"),
              FOREIGN KEY ("user_id") REFERENCES "user"("id"),
              FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "contact" (
              "id" SERIAL PRIMARY KEY,
              "type" TEXT NOT NULL,
              "value" TEXT NOT NULL,
              "description" TEXT,
              "user_id" INTEGER,
              UNIQUE ("type", "value"),
              FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
            );
            
            CREATE TABLE "role" (
              "id" SERIAL PRIMARY KEY,
              "name" VARCHAR(50) NOT NULL,
              "description" VARCHAR(255) NOT NULL DEFAULT ''
            );
            
            CREATE TABLE "user_role" (
              "user_id" INTEGER NOT NULL,
              "role_id" INTEGER NOT NULL,
              "assigned_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY ("user_id", "role_id"),
              FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
              FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE
            );
        """)

    def extract_directories(self, file_path):
        parts = file_path.split('/')
        directories = parts[:-1]  # All parts except the last one (which is the file name)
        return directories

    def get_parent_path(self, path):
        parts = path.split('/')
        if len(parts) > 1:
            parts.pop()  # Remove the last part (file or directory name)
            return ''.join(parts)
        return ''  # Return empty string if there's no parent (top-level file)

    def create_file_and_directories(self, cur, file, dataset_id):
        pg_file = self.mongo_file_to_pg_file(file)
        directories = self.extract_directories(pg_file["path"])

        # Insert directories
        parent_id = None
        current_path = ""
        for dir_name in directories:
            current_path += dir_name + "/"
            cur.execute(
                """
                INSERT INTO dataset_file (name, path, dataset_id, filetype)
                VALUES (%s, %s, %s, 'directory')
                ON CONFLICT (path, dataset_id) DO NOTHING
                RETURNING id
                """,
                (dir_name, current_path.rstrip('/'), dataset_id)
            )
            dir_id = cur.fetchone()[0]

            if parent_id:
                cur.execute(
                    """
                    INSERT INTO dataset_file_hierarchy (parent_id, child_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (parent_id, dir_id)
                )
            parent_id = dir_id

        # Insert file
        cur.execute(
            """
            INSERT INTO dataset_file (name, path, md5, size, dataset_id, filetype)
            VALUES (%s, %s, %s, %s, %s, 'file')
            RETURNING id
            """,
            (
                pg_file["name"],
                pg_file["path"],
                pg_file["md5"],
                pg_file["size"],
                dataset_id,
            )
        )
        file_id = cur.fetchone()[0]

        # Link file to its parent directory
        if parent_id:
            cur.execute(
                """
                INSERT INTO dataset_file_hierarchy (parent_id, child_id)
                VALUES (%s, %s)
                """,
                (parent_id, file_id)
            )

        return file_id

    def get_scauser_id(self, cur):
        cur.execute(
            """
            SELECT id FROM "user" WHERE username = 'scauser'
            """
        )
        sca_user_id = cur.fetchone()

        if sca_user_id is None:
            raise ValueError("User 'scauser' not found in the PostgreSQL database")

        return sca_user_id[0]

    def create_roles(self):
        with self.postgres_conn.cursor() as cur:
            roles = [
                {'name': 'admin', 'description': 'Access to the Admin Panel'},
                {'name': 'operator', 'description': 'Operator level access'},
                {'name': 'user', 'description': 'User level access'}
            ]

            for role in roles:
                cur.execute(
                    """
                    INSERT INTO role (name, description)
                    VALUES (%s, %s)
                    """,
                    (role['name'], role['description'])
                )

            print(f"Inserted or updated {len(roles)} roles.")

    def convert_users(self):
        with self.postgres_conn.cursor() as cur:
            users = self.mongo_db.users.find()
            for user in users:
                self.convert_user(user, cur)

    def convert_user(self, mongo_user, cur):
        # Create user in
        cur.execute(
            """
            INSERT INTO "user" (username, email, name, cas_id, is_deleted)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                mongo_user.get("username"),
                mongo_user.get("email"),
                mongo_user.get("fullname"),
                mongo_user.get("cas_id"),
                not mongo_user.get("active", False),
            )
        )
        user_id = cur.fetchone()[0]

        # Mongo roles to Postgres roles
        role_mapping = {
            'admin': 'admin',
            'god': 'admin',
            'user': 'operator',
            'guest': 'user'
        }

        # Fetch all roles from Postgres - admin, operator, user
        cur.execute("SELECT id, name FROM role")
        postgres_roles = {row[1]: row[0] for row in cur.fetchall()}

        # Create user_role associations
        for mongo_role in mongo_user.get('roles', []):
            postgres_role_name = role_mapping.get(mongo_role)
            if postgres_role_name and postgres_role_name in postgres_roles:
                cur.execute(
                    """
                    INSERT INTO user_role (user_id, role_id)
                    VALUES (%s, %s)
                    """,
                    (user_id, postgres_roles[postgres_role_name])
                )

    def convert_projects(self):
        with self.postgres_conn.cursor() as cur:
            projects = self.mongo_db.projects.find()
            for project in projects:
                # Insert project
                cur.execute(
                    """
                    INSERT INTO project (name, slug, description, browser_enabled)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        project.get("name"),
                        project.get("slug"),
                        project.get("description"),
                        project.get("browser_enabled", False),
                    )
                )
                project_id = cur.fetchone()[0]

                # Process dataproducts
                for dataproduct_id in project.get("dataproducts", []):
                    # Fetch the dataproduct from MongoDB
                    mongo_dataproduct = self.mongo_db.dataproduct.find_one({"_id": dataproduct_id})

                    if mongo_dataproduct:
                        dataproduct_name = mongo_dataproduct.get("name")
                        is_deleted = mongo_dataproduct.get("visible")

                        # Find the corresponding dataset in Postgres
                        cur.execute(
                            """
                            SELECT id FROM dataset
                            WHERE name = %s AND is_deleted = %s AND type = 'DATA_PRODUCT'
                            """,
                            (dataproduct_name, is_deleted)
                        )
                        dataset_result = cur.fetchone()

                        if dataset_result:
                            dataset_id = dataset_result[0]
                            # Create project_dataset association
                            cur.execute(
                                """
                                INSERT INTO project_dataset (project_id, dataset_id)
                                VALUES (%s, %s)
                                """,
                                (project_id, dataset_id)
                            )
                        else:
                            print(f"Warning: Dataset not found for dataproduct name: {dataproduct_name}")
                    else:
                        print(f"Warning: Dataproduct not found in MongoDB for id: {dataproduct_id}")

    @staticmethod
    def mongo_file_to_pg_file(file: dict) -> dict:
        return {
            "name": file.get("path", "").split("/")[-1],
            "path": file.get("path"),
            "md5": file.get("md5"),
            "size": file.get("size"),
        }

    def convert_datasets(self):
        with self.postgres_conn.cursor() as cur:
            sca_user_id = self.get_scauser_id(cur)

            mongo_datasets = self.mongo_db.dataset.find()
            for mongo_dataset in mongo_datasets:
                cur.execute(
                    """
                    INSERT INTO dataset (name, type, description, num_directories, num_files, 
                                         du_size, size, created_at, updated_at, origin_path, 
                                         archive_path, id_deleted, is_staged, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        mongo_dataset["name"],
                        "RAW_DATA",
                        mongo_dataset.get("description"),
                        mongo_dataset.get("directories"),
                        mongo_dataset.get("files"),
                        mongo_dataset.get("du_size"),
                        mongo_dataset.get("size"),
                        mongo_dataset.get("createdAt", datetime.utcnow()),
                        mongo_dataset.get("updatedAt", datetime.utcnow()),
                        mongo_dataset.get("paths", {}).get("origin"),
                        mongo_dataset.get("paths", {}).get("archive"),
                        mongo_dataset.get("visible", False),
                        mongo_dataset.get("staged", False),
                        json.dumps(mongo_dataset),
                    )
                )
                raw_data_dataset_id = cur.fetchone()[0]

                # Insert dataset_audit records if events exist
                self.create_audit_logs_from_dataset_events(cur, mongo_dataset, raw_data_dataset_id, sca_user_id)

                for checksum in mongo_dataset.get("checksums", []):
                    self.create_file_and_directories(cur, checksum, raw_data_dataset_id)

    def convert_data_products(self):
        with self.postgres_conn.cursor() as cur:
            sca_user_id = self.get_scauser_id(cur)

            mongo_data_products = self.mongo_db.dataproduct.find()
            for mongo_data_product in mongo_data_products:
                cur.execute(
                    """
                    INSERT INTO dataset (name, type, description, num_files, size, created_at, 
                                         updated_at, archive_path, is_staged, is_deleted, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        mongo_data_product["name"],
                        "DATA_PRODUCT",
                        None,
                        len(mongo_data_product.get("files", [])),
                        mongo_data_product.get("size"),
                        mongo_data_product.get("createdAt", datetime.utcnow()),
                        mongo_data_product.get("updatedAt", datetime.utcnow()),
                        mongo_data_product.get("paths", {}).get("archive"),
                        mongo_data_product.get("staged", False),
                        mongo_data_product.get("visible", False),
                        json.dumps(mongo_data_product),
                    )
                )
                data_product_dataset_id = cur.fetchone()[0]

                # Create dataset hierarchies
                if "dataset" in mongo_data_product:
                    # Fetch the corresponding RAW_DATA dataset id from postgres
                    cur.execute(
                        """
                        SELECT id FROM dataset
                        WHERE name = %s AND is_deleted = %s AND type = 'RAW_DATA'
                        """,
                        (mongo_data_product["dataset"], mongo_data_product["visible"])
                    )
                    raw_data_result = cur.fetchone()
                    if raw_data_result:
                        raw_data_dataset_id = raw_data_result[0]
                        # Create dataset hierarchy
                        cur.execute(
                            """
                            INSERT INTO dataset_hierarchy (source_id, derived_id)
                            VALUES (%s, %s)
                            """,
                            (raw_data_dataset_id, data_product_dataset_id)
                        )
                    else:
                        print(f"Warning: RAW_DATA dataset not found for {mongo_data_product['dataset']}")

                # Insert dataset_audit records if events exist
                self.create_audit_logs_from_dataset_events(cur, mongo_data_product, data_product_dataset_id, sca_user_id)

                for file in mongo_data_product.get("files", []):
                    self.create_file_and_directories(cur, file, data_product_dataset_id)

    def convert_content_to_about(self):
        with self.postgres_conn.cursor() as cur:
            sca_user_id = self.get_scauser_id(cur)

            contents = self.mongo_db.content.find()
            for content in contents:
                # Get the details
                details = content.get("details", "")
                # Escape HTML special characters
                escaped_details = html.escape(details)
                # Split the string into paragraphs, and wrap each in <p> elements
                paragraphs = escaped_details.split('\n\n')
                html_content = ''.join(f'<p>{p.strip()}</p>' for p in paragraphs if p.strip())

                cur.execute(
                    """
                    INSERT INTO about (html, last_updated_by_id)
                    VALUES (%s, %s)
                    """,
                    (
                        html_content,
                        sca_user_id,
                    )
                )

    # This shouldn't be necessary. No `event` documents have been created in CMG since 2021.
    # def events_to_audit_logs(self):
    #     with self.postgres_conn.cursor() as cur:
    #         sca_user_id = self.get_scauser_id(cur)
    #
    #         events = self.mongo_db.events.find({
    #             "$or": [
    #                 {"dataproduct": {"$ne": None}},
    #                 {"dataset": {"$ne": None}}
    #             ]
    #         })
    #
    #         for event in events:
    #             dataset_name = None
    #             dataset_type = None
    #             is_deleted = False
    #
    #             if event.get("dataproduct"):
    #                 dataproduct = self.mongo_db.dataproducts.find_one({"_id": event["dataproduct"]})
    #                 if dataproduct:
    #                     dataset_name = dataproduct.get("name")
    #                     dataset_type = "DATA_PRODUCT"
    #                     is_deleted = dataproduct.get("visible", False)
    #             elif event.get("dataset"):
    #                 dataset = self.mongo_db.datasets.find_one({"_id": event["dataset"]})
    #                 if dataset:
    #                     dataset_name = dataset.get("name")
    #                     dataset_type = "RAW_DATA"
    #                     is_deleted = dataset.get("visible", False)
    #
    #             if dataset_name and dataset_type:
    #                 cur.execute(
    #                     """
    #                     SELECT id FROM dataset
    #                     WHERE name = %s AND type = %s AND is_deleted = %s
    #                     """,
    #                     (dataset_name, dataset_type, is_deleted)
    #                 )
    #                 result = cur.fetchone()
    #
    #                 if result:
    #                     dataset_id = result[0]
    #                     action = event.get("action") + " - " + event.get("details")
    #                     timestamp = event.get("createdAt")
    #                     mongo_user_id = event.get("user")
    #
    #                     # Try to fetch the corresponding Postgres user
    #                     cur.execute(
    #                         """
    #                         SELECT id FROM "user"
    #                         WHERE cas_id = %s
    #                         """,
    #                         (str(mongo_user_id),)
    #                     )
    #                     pg_user_result = cur.fetchone()
    #
    #                     if pg_user_result:
    #                         user_id = pg_user_result[0]
    #                     else:
    #                         # if no matching user found, use scauser
    #                         user_id = sca_user_id
    #
    #                     cur.execute(
    #                         """
    #                         INSERT INTO dataset_audit (action, timestamp, user_id, dataset_id)
    #                         VALUES (%s, %s, %s, %s)
    #                         """,
    #                         (action, timestamp, user_id, dataset_id)
    #                     )

    def create_audit_logs_from_dataset_events(self, cur, mongo_dataset, postgres_dataset_id, user_id):
        events = mongo_dataset.get("events", [])
        if len(events) > 0:
            for event in events:
                cur.execute(
                    """
                    INSERT INTO dataset_audit (action, timestamp, dataset_id, user_id)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        event.get("description"),
                        event.get("createdAt"),
                        postgres_dataset_id,
                        user_id,
                    )
                )

    def convert_all(self):
        try:
            # Start transaction
            self.postgres_conn.cursor().execute("BEGIN")

            self.create_tables()
            self.create_roles()
            self.convert_users()
            self.convert_projects()
            self.convert_datasets()
            self.convert_data_products()
            self.convert_content_to_about()

            # Commit the transaction if everything succeeds
            self.postgres_conn.commit()
            print("Data conversion completed successfully.")
        except Exception as e:
            # Rollback if an error occurs
            self.postgres_conn.rollback()
            print(f"An error occurred during conversion: {e}")
            raise
        finally:
            self.close_connections()

    def close_connections(self):
        self.mongo_client.close()
        self.postgres_conn.close()


if __name__ == "__main__":
    mongo_connection_string = ""
    pg_connection_string = ""

    converter = MongoToPostgresConversionManager(mongo_connection_string, pg_connection_string)
    converter.convert_all()
