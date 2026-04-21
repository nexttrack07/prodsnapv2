import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Clerk JWT issuer domain - set via environment variable in Convex dashboard
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
