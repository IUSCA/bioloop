-- AlterTable
ALTER TABLE "workflow" ADD COLUMN     "initiator_id" INTEGER;

-- AddForeignKey
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
