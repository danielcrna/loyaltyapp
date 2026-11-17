-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "brandLogoId" TEXT,
ADD COLUMN     "stampEmptyIconId" TEXT,
ADD COLUMN     "stampIconId" TEXT,
ADD COLUMN     "stampStyle" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "claimEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "claimLimit" INTEGER,
ADD COLUMN     "claimToken" TEXT;

-- AlterTable
ALTER TABLE "CustomerCoupon" ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_claimToken_key" ON "Promotion"("claimToken");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_stampIconId_fkey" FOREIGN KEY ("stampIconId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_stampEmptyIconId_fkey" FOREIGN KEY ("stampEmptyIconId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_brandLogoId_fkey" FOREIGN KEY ("brandLogoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

