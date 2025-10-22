/*
  Warnings:

  - The primary key for the `group` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `group` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `parent_id` column on the `group` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `group_project` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `group_user` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `group_id` on the `group_project` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `group_id` on the `group_user` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "group" DROP CONSTRAINT "group_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "group_project" DROP CONSTRAINT "group_project_group_id_fkey";

-- DropForeignKey
ALTER TABLE "group_user" DROP CONSTRAINT "group_user_group_id_fkey";

-- AlterTable
ALTER TABLE "group" DROP CONSTRAINT "group_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "parent_id",
ADD COLUMN     "parent_id" INTEGER,
ADD CONSTRAINT "group_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "group_project" DROP CONSTRAINT "group_project_pkey",
DROP COLUMN "group_id",
ADD COLUMN     "group_id" INTEGER NOT NULL,
ADD CONSTRAINT "group_project_pkey" PRIMARY KEY ("group_id", "project_id");

-- AlterTable
ALTER TABLE "group_user" DROP CONSTRAINT "group_user_pkey",
DROP COLUMN "group_id",
ADD COLUMN     "group_id" INTEGER NOT NULL,
ADD CONSTRAINT "group_user_pkey" PRIMARY KEY ("group_id", "user_id");

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_user" ADD CONSTRAINT "group_user_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_project" ADD CONSTRAINT "group_project_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
