// server/prisma/seed.js
// Seeds 10 sample rows into the Employee directory (ward staff — NOT login
// accounts; see schema.prisma's Employee model). Safe to re-run: it
// upserts on phone number so you won't get duplicates.
//
// Run with:  node prisma/seedEmployee.js
// (or wire it into package.json as "prisma": { "seed": "node prisma/seed.js" }
// and run `npx prisma db seed`) C:\Users\Admin\Desktop\Abacco Tech\healthcare\server\prisma\seedEmployee.js

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const employees = [
  {
    fullName: "Anita Sharma",
    designation: "Nurse",
    phone: "9845010001",
    email: "anita.sharma@example.com",
    joiningDate: new Date("2022-03-14"),
    notes: "ICU-trained, prefers morning shift.",
    salary: 28000,
    bankName: "State Bank of India",
    ifscCode: "SBIN0001234",
    bankAccountNo: "34521098765",
  },
  {
    fullName: "Ravi Kumar",
    designation: "Ward Boy",
    phone: "9845010002",
    email: "ravi.kumar@example.com",
    joiningDate: new Date("2021-07-01"),
    notes: null,
    salary: 16000,
    bankName: "HDFC Bank",
    ifscCode: "HDFC0000456",
    bankAccountNo: "50100234567",
  },
  {
    fullName: "Meena Iyer",
    designation: "Receptionist Assistant",
    phone: "9845010003",
    email: "meena.iyer@example.com",
    joiningDate: new Date("2023-01-09"),
    notes: "Handles front-desk overflow during peak OPD hours.",
    salary: 19500,
    bankName: "ICICI Bank",
    ifscCode: "ICIC0000789",
    bankAccountNo: "60123456789",
  },
  {
    fullName: "Suresh Naik",
    designation: "Cleaner",
    phone: "9845010004",
    email: null,
    joiningDate: new Date("2020-11-20"),
    notes: null,
    salary: 12000,
    bankName: "Canara Bank",
    ifscCode: "CNRB0001122",
    bankAccountNo: "11002233445",
  },
  {
    fullName: "Priya Deshmukh",
    designation: "Nurse",
    phone: "9845010005",
    email: "priya.deshmukh@example.com",
    joiningDate: new Date("2022-09-05"),
    notes: "Certified for pediatric ward.",
    salary: 27000,
    bankName: "Axis Bank",
    ifscCode: "UTIB0002233",
    bankAccountNo: "91800112233",
  },
  {
    fullName: "Manoj Pillai",
    designation: "Security Guard",
    phone: "9845010006",
    email: null,
    joiningDate: new Date("2019-05-18"),
    notes: "Night shift, gate 2.",
    salary: 14000,
    bankName: "Punjab National Bank",
    ifscCode: "PUNB0003344",
    bankAccountNo: "22334455667",
  },
  {
    fullName: "Fatima Sheikh",
    designation: "Pharmacy Assistant",
    phone: "9845010007",
    email: "fatima.sheikh@example.com",
    joiningDate: new Date("2023-06-12"),
    notes: "Supports billing counter during rush hours.",
    salary: 18500,
    bankName: "State Bank of India",
    ifscCode: "SBIN0005566",
    bankAccountNo: "34500998877",
  },
  {
    fullName: "Vikram Rao",
    designation: "Ward Boy",
    phone: "9845010008",
    email: null,
    joiningDate: new Date("2021-02-28"),
    notes: null,
    salary: 16000,
    bankName: "HDFC Bank",
    ifscCode: "HDFC0007788",
    bankAccountNo: "50109988776",
  },
  {
    fullName: "Lakshmi Menon",
    designation: "Nurse",
    phone: "9845010009",
    email: "lakshmi.menon@example.com",
    joiningDate: new Date("2020-08-03"),
    notes: "Senior nurse, mentors new joinees.",
    salary: 31000,
    bankName: "Bank of Baroda",
    ifscCode: "BARB0VJRAJK",
    bankAccountNo: "44556677889",
  },
  {
    fullName: "Deepak Joshi",
    designation: "Cleaner",
    phone: "9845010010",
    email: null,
    joiningDate: new Date("2024-01-15"),
    notes: "Recently joined, currently on probation.",
    salary: 12500,
    bankName: "Canara Bank",
    ifscCode: "CNRB0009900",
    bankAccountNo: "11009988771",
  },
];

async function main() {
  console.log(`Seeding ${employees.length} employees...`);

  // Employee.phone isn't a unique column in the schema, so prisma.upsert()
  // isn't available here — look each one up by phone manually instead.
  for (const emp of employees) {
    const existing = await prisma.employee.findFirst({ where: { phone: emp.phone } });
    const result = existing
      ? await prisma.employee.update({ where: { id: existing.id }, data: emp })
      : await prisma.employee.create({ data: emp });
    console.log(`  ✓ ${result.fullName} (${result.designation})`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });