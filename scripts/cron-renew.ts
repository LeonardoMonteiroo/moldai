import { PrismaClient } from "@prisma/client";
import { withWallet } from "../lib/db/wallet";
import { renewWallet, isRenewalDue } from "../lib/billing/wallet";
import { reportError } from "../lib/observability/report";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const due = await prisma.wallet.findMany({
    where: { renewsAt: { lte: now } },
    select: { userId: true },
  });

  // #40: `due` is only a snapshot from an unlocked query -- by the time this
  // loop reaches a given userId, another process's renewal (or a subscribe
  // purchase that just set a fresh renewsAt) may have already landed. Each
  // wallet is re-checked against the locked row itself, immediately before
  // renewing, rather than trusting the snapshot; saveWallet/saveLedger
  // already no-op harmlessly on an empty entries array.
  let renewedCount = 0;
  for (const { userId } of due) {
    await withWallet(userId, (wallet) => {
      if (!isRenewalDue(wallet, now)) {
        return { result: undefined, entries: [] };
      }
      renewedCount++;
      const entry = renewWallet(wallet, now);
      return { result: undefined, entries: [entry] };
    });
  }

  console.log(
    `[cron-renew] renewed ${renewedCount} of ${due.length} due wallet(s) at ${now.toISOString()}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    reportError("cron-renew", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
