-- CreateTable
CREATE TABLE "Molde" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Molde_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "Molde" ADD CONSTRAINT "Molde_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
