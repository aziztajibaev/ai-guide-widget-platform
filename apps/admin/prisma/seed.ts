import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();
const prismaWithUser = prisma as PrismaClient & {
  user: {
    upsert: (args: {
      where: { email: string };
      update: { projectId: string };
      create: { email: string; passwordHash: string; projectId: string };
    }) => Promise<unknown>;
  };
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function seedAdminCredentials() {
  const email = (process.env.ADMIN_EMAIL || process.env.SMARTUP_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || process.env.SMARTUP_ADMIN_PASSWORD || "").trim();

  if (email && password) {
    return { email, password };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be configured before seeding in production.");
  }

  return {
    email: email || "admin@smartup.local",
    password: password || "smartup-admin"
  };
}

async function main() {
  const admin = seedAdminCredentials();
  const project = await prisma.project.upsert({
    where: { publicId: "demo-project" },
    update: {
      name: "Demo Project",
      domain: "localhost",
      theme: {
        accent: "#2563eb",
        robotBaseUrl: "/robot",
        robotAssetFormat: "png",
        logoText: "smartup"
      }
    },
    create: {
      publicId: "demo-project",
      name: "Demo Project",
      domain: "localhost",
      theme: {
        accent: "#2563eb",
        robotBaseUrl: "/robot",
        robotAssetFormat: "png",
        logoText: "smartup"
      }
    }
  });

  await prisma.guideRule.deleteMany({
    where: { projectId: project.id }
  });

  await prisma.knowledgeDocument.deleteMany({
    where: { projectId: project.id }
  });

  await prisma.knowledgeDocument.create({
    data: {
      projectId: project.id,
      title: "Demo users page manual",
      content:
        "The Users page has a Create button for adding a new user, a Search field for finding users, and a Filters button for advanced filtering. The right Filters panel contains User ID, Name, Roles, and Gender fields. To filter by role, guide the user to the Roles field. To add a user, guide the user to click Create, then fill the name field in the modal, then save the form.",
      tags: ["users", "create", "filter", "roles"],
      enabled: true
    }
  });

  await prismaWithUser.user.upsert({
    where: { email: admin.email },
    update: { projectId: project.id },
    create: {
      email: admin.email,
      passwordHash: hashPassword(admin.password),
      projectId: project.id
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
