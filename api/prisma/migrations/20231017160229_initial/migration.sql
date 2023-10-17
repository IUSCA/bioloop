-- CreateEnum
CREATE TYPE "access_type" AS ENUM ('BROWSER', 'SLATE_SCRATCH');

-- CreateTable
CREATE TABLE "dataset" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "num_directories" INTEGER,
    "num_files" INTEGER,
    "du_size" BIGINT,
    "size" BIGINT,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin_path" TEXT,
    "archive_path" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "is_staged" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_hierarchy" (
    "source_id" INTEGER NOT NULL,
    "derived_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_hierarchy_pkey" PRIMARY KEY ("source_id","derived_id")
);

-- CreateTable
CREATE TABLE "dataset_file" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "path" TEXT NOT NULL,
    "md5" TEXT,
    "size" BIGINT,
    "filetype" TEXT,
    "metadata" JSONB,
    "status" TEXT,
    "dataset_id" INTEGER NOT NULL,

    CONSTRAINT "dataset_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_file_hierarchy" (
    "parent_id" INTEGER NOT NULL,
    "child_id" INTEGER NOT NULL,

    CONSTRAINT "dataset_file_hierarchy_pkey" PRIMARY KEY ("parent_id","child_id")
);

-- CreateTable
CREATE TABLE "dataset_audit" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "old_data" JSONB,
    "new_data" JSONB,
    "user_id" INTEGER,
    "dataset_id" INTEGER,

    CONSTRAINT "dataset_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_state" (
    "state" TEXT NOT NULL,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "dataset_id" INTEGER NOT NULL,

    CONSTRAINT "dataset_state_pkey" PRIMARY KEY ("timestamp","dataset_id","state")
);

-- CreateTable
CREATE TABLE "data_access_log" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_type" "access_type" NOT NULL,
    "file_id" INTEGER,
    "dataset_id" INTEGER,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "data_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_request_log" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataset_id" INTEGER,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "stage_request_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100),
    "email" VARCHAR(100) NOT NULL,
    "cas_id" VARCHAR(100),
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_password" (
    "id" SERIAL NOT NULL,
    "password" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "user_password_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_login" (
    "id" SERIAL NOT NULL,
    "last_login" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "user_login_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "user_id" INTEGER,

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255) NOT NULL DEFAULT '',

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "workflow" (
    "id" TEXT NOT NULL,
    "dataset_id" INTEGER,

    CONSTRAINT "workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric" (
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "measurement" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "usage" BIGINT,
    "limit" BIGINT,
    "fields" JSONB,
    "tags" JSONB,

    CONSTRAINT "metric_pkey" PRIMARY KEY ("timestamp","measurement","subject")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "browser_enabled" BOOLEAN NOT NULL DEFAULT false,
    "funding" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_user" (
    "project_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_user_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "project_dataset" (
    "project_id" TEXT NOT NULL,
    "dataset_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_dataset_pkey" PRIMARY KEY ("project_id","dataset_id")
);

-- CreateTable
CREATE TABLE "project_contact" (
    "project_id" TEXT NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_contact_pkey" PRIMARY KEY ("project_id","contact_id")
);

-- CreateTable
CREATE TABLE "log" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "worker_process_id" INTEGER NOT NULL,

    CONSTRAINT "log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_process" (
    "id" SERIAL NOT NULL,
    "pid" INTEGER NOT NULL,
    "task_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "tags" JSONB,
    "start_time" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hostname" TEXT NOT NULL,

    CONSTRAINT "worker_process_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_name_type_is_deleted_key" ON "dataset"("name", "type", "is_deleted");

-- CreateIndex
CREATE INDEX "dataset_file_dataset_id_idx" ON "dataset_file"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_file_path_dataset_id_key" ON "dataset_file"("path", "dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_cas_id_key" ON "user"("cas_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_password_user_id_key" ON "user_password"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_login_user_id_key" ON "user_login"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_type_value_key" ON "contact"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "project_slug_key" ON "project"("slug");

-- CreateIndex
CREATE INDEX "log_worker_process_id_idx" ON "log"("worker_process_id");

-- AddForeignKey
ALTER TABLE "dataset_hierarchy" ADD CONSTRAINT "dataset_hierarchy_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_hierarchy" ADD CONSTRAINT "dataset_hierarchy_derived_id_fkey" FOREIGN KEY ("derived_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_file" ADD CONSTRAINT "dataset_file_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_file_hierarchy" ADD CONSTRAINT "dataset_file_hierarchy_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "dataset_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_file_hierarchy" ADD CONSTRAINT "dataset_file_hierarchy_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "dataset_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_audit" ADD CONSTRAINT "dataset_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_audit" ADD CONSTRAINT "dataset_audit_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_state" ADD CONSTRAINT "dataset_state_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_access_log" ADD CONSTRAINT "data_access_log_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "dataset_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_access_log" ADD CONSTRAINT "data_access_log_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_access_log" ADD CONSTRAINT "data_access_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_request_log" ADD CONSTRAINT "stage_request_log_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_request_log" ADD CONSTRAINT "stage_request_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_password" ADD CONSTRAINT "user_password_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_login" ADD CONSTRAINT "user_login_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_user" ADD CONSTRAINT "project_user_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_user" ADD CONSTRAINT "project_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dataset" ADD CONSTRAINT "project_dataset_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dataset" ADD CONSTRAINT "project_dataset_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contact" ADD CONSTRAINT "project_contact_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contact" ADD CONSTRAINT "project_contact_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log" ADD CONSTRAINT "log_worker_process_id_fkey" FOREIGN KEY ("worker_process_id") REFERENCES "worker_process"("id") ON DELETE CASCADE ON UPDATE CASCADE;
