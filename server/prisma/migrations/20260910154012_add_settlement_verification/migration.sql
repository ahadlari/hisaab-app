-- AlterEnum
ALTER TYPE "SettlementStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "settlements" ADD COLUMN     "proofUrl" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "upiId" TEXT;
