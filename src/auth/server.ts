import { betterAuth } from "better-auth";
import { Pool } from "pg";

export interface CompensaAuthOptions {
  allowSignUp?: boolean;
}

function requireEnvironment(name: "DATABASE_URL" | "BETTER_AUTH_SECRET"): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required for Compensa authentication.`);
  }
  return value;
}

export function createCompensaAuth(options: CompensaAuthOptions = {}) {
  const databaseUrl = requireEnvironment("DATABASE_URL");
  const secret = requireEnvironment("BETTER_AUTH_SECRET");
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  return betterAuth({
    appName: "Compensa",
    baseURL,
    secret,
    database: new Pool({ connectionString: databaseUrl, max: 5 }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: options.allowSignUp !== true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    user: {
      modelName: "auth_users",
      fields: {
        name: "name",
        email: "email",
        emailVerified: "email_verified",
        image: "image",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "auth_sessions",
      fields: {
        userId: "user_id",
        token: "token",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    account: {
      modelName: "auth_accounts",
      fields: {
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        scope: "scope",
        idToken: "id_token",
        password: "password",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      modelName: "auth_verifications",
      fields: {
        identifier: "identifier",
        value: "value",
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    rateLimit: {
      enabled: true,
      storage: "memory",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "compensa",
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
  });
}

export const auth = createCompensaAuth();
