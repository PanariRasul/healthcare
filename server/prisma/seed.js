// server/prisma/seed.js
// Run: node prisma/seed.js

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_USERS = [
  {
    fullName: "Super Admin",
    email: "admin@gmail.com",
    phone: "919876543209",    
    password: "123456",
    role: "ADMIN",
    // Admins aren't assigned to a Module — see auth.controller.js: "ADMIN"
    // is a login context, checked against role, not the modules array.
    modules: [],
  },
  // {
  //   fullName: "Dr. Ashwin Menon",
  //   email: "doctor@gmail.com",
  //   phone: "919876543210",
  //   password: "123456",
  //   role: "DOCTOR",
  //   modules: ["OPD", "IPD"],
  // },
  // {
  //   fullName: "Reception Desk",
  //   email: "reciption@gmail.com",
  //   phone: "919876543211",
  //   password: "123456",
  //   role: "RECEPTIONIST",
  //   modules: ["OPD", "IPD"],
  // },
  // {
  //   fullName: "Pharmacy Desk",
  //   email: "pharmacy@gmail.com",
  //   phone: "919876543212",
  //   password: "123456",
  //   role: "PHARMACY",
  //   modules: ["PHARMACY"],
  // },
  //   {
  //   fullName: "Manager",
  //   email: "manager@gmail.com",
  //   phone: "919876543213",
  //   password: "123456",
  //   role: "MANAGER",
  //   modules: ["OPD", "IPD", "PHARMACY"],
  // },
];

async function main() {
  console.log("🌱 Seeding users...\n");

  for (const u of SEED_USERS) {
    const hashedPassword = await bcrypt.hash(u.password, 10);

    const user = await prisma.user.upsert({
      where: {
        email: u.email,
      },
      update: {
        fullName: u.fullName,
        phone: u.phone,
        password: hashedPassword,
        role: u.role,
        modules: u.modules,
        isActive: true,
      },
      create: {
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        password: hashedPassword,
        role: u.role,
        modules: u.modules,
        isActive: true,
      },
    });

    console.log(
      `✅ ${user.role} created/updated -> ${user.email} | ${user.phone}`
    );
  }

  console.log("\n🎉 Seed completed successfully.");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed");
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });