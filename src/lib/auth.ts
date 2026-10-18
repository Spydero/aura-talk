import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3847";

export const auth = betterAuth({
  appName: "JojoTeams",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [baseURL],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
  },
  advanced: {
    useSecureCookies: false,
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
