import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { withWallet } from "../lib/db/wallet";
import { renewWallet, isRenewalDue } from "../lib/billing/wallet";
import { reportError } from "../lib/observability/report";

const prisma = new PrismaClient();

export async function main() {
  const now = new Date();
  // #161: a wallet with a live `stripeSubscriptionId` is renewed by its own
  // Stripe subscription payment webhook (app/api/billing/webhook/route.ts's
  // handleConfirmed -> applyPurchase), not by this sweep -- issue #6's own
  // step 7 decision. Without this exclusion, a subscribed wallet whose
  // renewsAt happened to fall past-due before that webhook landed (or in
  // the same hour as it) would be renewed TWICE: once here, resetting
  // balance to total+purchased and rolling renewsAt forward 30 days, and
  // again by the webhook doing the same thing -- silently doubling a paid
  // wallet's credits with no ledger row flagging it as wrong (both writes
  // look like ordinary, individually-correct renew/subscribe entries).
  const due = await prisma.wallet.findMany({
    where: { renewsAt: { lte: now }, stripeSubscriptionId: null },
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

// `main` is exported (and this run-as-entry-point guarded) so
// scripts/cron-renew.test.ts can import it directly and assert on the
// findMany/withWallet calls without also triggering process.exit -- an
// unguarded top-level call would kill the test runner's own process the
// instant this module is imported.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      reportError("cron-renew", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
