import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/hash";
import { seedWallet, applyPurchase } from "../lib/billing/wallet";

const prisma = new PrismaClient();

// dev@ is left to lazy-seed the Free wallet on first access; atelier@ gets a
// materialized Ateliê row, so the two dev accounts cover both plan states.
const USERS = [
  {
    email: "dev@moldai.local",
    name: "Dev",
    password: "moldai-dev",
    atelier: false,
  },
  {
    email: "atelier@moldai.local",
    name: "Ateliê",
    password: "moldai-dev",
    atelier: true,
  },
];

async function main() {
  const now = new Date();
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash: await hashPassword(u.password),
        // Dev accounts skip the verification gate: there is no inbox for
        // dev@moldai.local. Real sign-ups still go through /verify.
        emailVerified: now,
      },
    });
    if (!u.atelier) continue;
    // Built through applyPurchase so the Ateliê shape stays defined in one
    // place (lib/billing/wallet.ts) instead of being duplicated here.
    const wallet = seedWallet(now);
    applyPurchase(wallet, "subscribe", now);
    await prisma.wallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...wallet },
      update: {}, // a reseed must not clobber a balance the dev has spent
    });
  }
  console.log("Seed complete:", USERS.map((u) => u.email).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
