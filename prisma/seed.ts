import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/hash";

const prisma = new PrismaClient();

const USERS = [
  { email: "dev@moldai.local", name: "Dev", password: "moldai-dev" },
  { email: "atelier@moldai.local", name: "Ateliê", password: "moldai-dev" },
];

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash: await hashPassword(u.password),
      },
    });
  }
  console.log("Seed concluído:", USERS.map((u) => u.email).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
