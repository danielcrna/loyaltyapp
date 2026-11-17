-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('POINTS', 'CASHBACK', 'STAMPS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('WELCOME', 'EARN', 'VISIT', 'REDEEM_REWARD', 'REDEEM_CASHBACK', 'COUPON', 'ADJUST');

-- CreateEnum
CREATE TYPE "AutoAssign" AS ENUM ('NONE', 'NEW_MEMBERS', 'BIRTHDAY', 'WINBACK');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'EXPIRED', 'VOID');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'cafeteria',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "programType" "ProgramType" NOT NULL DEFAULT 'STAMPS',
    "programName" TEXT NOT NULL DEFAULT 'Tarjeta de lealtad',
    "pointsPerCurrency" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "cashbackPercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "stampsRequired" INTEGER NOT NULL DEFAULT 10,
    "stampReward" TEXT NOT NULL DEFAULT 'Una bebida gratis',
    "stampMinPurchase" INTEGER NOT NULL DEFAULT 0,
    "welcomeBonus" INTEGER NOT NULL DEFAULT 0,
    "minRedeemCashback" INTEGER NOT NULL DEFAULT 0,
    "programTerms" TEXT NOT NULL DEFAULT '',
    "bgColor" TEXT NOT NULL DEFAULT '#1f2937',
    "fgColor" TEXT NOT NULL DEFAULT '#ffffff',
    "labelColor" TEXT NOT NULL DEFAULT '#fbbf24',
    "logoId" TEXT,
    "stripId" TEXT,
    "winbackDays" INTEGER NOT NULL DEFAULT 30,
    "winbackMessage" TEXT NOT NULL DEFAULT '¡Te extrañamos! Ven a visitarnos y sigue sumando en tu tarjeta.',
    "birthdayMessage" TEXT NOT NULL DEFAULT '¡Feliz cumpleaños! Tenemos un regalo para ti en tu próxima visita.',
    "askEmail" BOOLEAN NOT NULL DEFAULT true,
    "askPhone" BOOLEAN NOT NULL DEFAULT true,
    "askBirthday" BOOLEAN NOT NULL DEFAULT true,
    "googleClassVersion" INTEGER NOT NULL DEFAULT 0,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "businessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "relevantText" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "birthday" DATE,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'qr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyCard" (
    "id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "cashbackCents" INTEGER NOT NULL DEFAULT 0,
    "stamps" INTEGER NOT NULL DEFAULT 0,
    "rewardsAvailable" INTEGER NOT NULL DEFAULT 0,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "totalSpentCents" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "lastVisitAt" TIMESTAMP(3),
    "lastMessage" TEXT,
    "lastReminderAt" TIMESTAMP(3),
    "lastBirthdayYear" INTEGER,
    "appleInstalled" BOOLEAN NOT NULL DEFAULT false,
    "googleSaved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "purchaseCents" INTEGER NOT NULL DEFAULT 0,
    "pointsDelta" INTEGER NOT NULL DEFAULT 0,
    "cashbackDelta" INTEGER NOT NULL DEFAULT 0,
    "stampsDelta" INTEGER NOT NULL DEFAULT 0,
    "rewardsDelta" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "staffId" TEXT,
    "locationId" TEXT,
    "rewardId" TEXT,
    "couponId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "pointsCost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "discountLabel" TEXT NOT NULL DEFAULT '',
    "imageId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "validDays" INTEGER,
    "autoAssign" "AutoAssign" NOT NULL DEFAULT 'NONE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "googleVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'broadcast',
    "promotionId" TEXT,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "appleSent" INTEGER NOT NULL DEFAULT 0,
    "googleSent" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleDevice" (
    "id" TEXT NOT NULL,
    "deviceLibraryIdentifier" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppleDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleRegistration" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "passTypeIdentifier" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppleLog" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Business_stripeCustomerId_key" ON "Business"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_stripeSubscriptionId_key" ON "Business"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Customer_businessId_createdAt_idx" ON "Customer"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_email_key" ON "Customer"("businessId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_phone_key" ON "Customer"("businessId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCard_serial_key" ON "LoyaltyCard"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCard_customerId_key" ON "LoyaltyCard"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyCard_businessId_lastVisitAt_idx" ON "LoyaltyCard"("businessId", "lastVisitAt");

-- CreateIndex
CREATE INDEX "Transaction_businessId_createdAt_idx" ON "Transaction"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_cardId_createdAt_idx" ON "Transaction"("cardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCoupon_code_key" ON "CustomerCoupon"("code");

-- CreateIndex
CREATE INDEX "CustomerCoupon_customerId_status_idx" ON "CustomerCoupon"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AppleDevice_deviceLibraryIdentifier_key" ON "AppleDevice"("deviceLibraryIdentifier");

-- CreateIndex
CREATE INDEX "AppleRegistration_serialNumber_idx" ON "AppleRegistration"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AppleRegistration_deviceId_passTypeIdentifier_serialNumber_key" ON "AppleRegistration"("deviceId", "passTypeIdentifier", "serialNumber");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_stripId_fkey" FOREIGN KEY ("stripId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "LoyaltyCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCoupon" ADD CONSTRAINT "CustomerCoupon_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppleRegistration" ADD CONSTRAINT "AppleRegistration_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AppleDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

