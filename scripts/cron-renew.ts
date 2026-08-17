import { PrismaClient } from "@prisma/client";
import { withWallet } from "../lib/db/wallet";
import { renewWallet } from "../lib/billing/wallet";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const due = await prisma.wallet.findMany({
    where: { renewsAt: { lte: now } },
    select: { userId: true },
  });

  for (const { userId } of due) {
    await withWallet(userId, (wallet) => {
      const entry = renewWallet(wallet, now);
      return { result: undefined, entries: [entry] };
    });
  }

  console.log(
    `[cron-renew] renewed ${due.length} wallet(s) at ${now.toISOString()}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[cron-renew] failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
