-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "hideNearbyAfterVisit" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "LoyaltyCard" ADD COLUMN     "nearbyMutedUntil" TIMESTAMP(3);

