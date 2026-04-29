/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adCopy from "../adCopy.js";
import type * as admin_audit from "../admin/audit.js";
import type * as admin_playground from "../admin/playground.js";
import type * as admin_playgroundActions from "../admin/playgroundActions.js";
import type * as ai from "../ai.js";
import type * as angleGenerations from "../angleGenerations.js";
import type * as billing_syncPlan from "../billing/syncPlan.js";
import type * as billing_webhookHandler from "../billing/webhookHandler.js";
import type * as board from "../board.js";
import type * as brandKits from "../brandKits.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as invariant from "../invariant.js";
import type * as lib_admin_requireAdmin from "../lib/admin/requireAdmin.js";
import type * as lib_billing_capabilities from "../lib/billing/capabilities.js";
import type * as lib_billing_claims from "../lib/billing/claims.js";
import type * as lib_billing_index from "../lib/billing/index.js";
import type * as lib_billing_planConfig from "../lib/billing/planConfig.js";
import type * as lib_billing_provider from "../lib/billing/provider.js";
import type * as migrations from "../migrations.js";
import type * as onboardingProfiles from "../onboardingProfiles.js";
import type * as productImages from "../productImages.js";
import type * as productInspirations from "../productInspirations.js";
import type * as productInspirationsActions from "../productInspirationsActions.js";
import type * as products from "../products.js";
import type * as promptGenerations from "../promptGenerations.js";
import type * as promptSuggestions from "../promptSuggestions.js";
import type * as prompts from "../prompts.js";
import type * as r2 from "../r2.js";
import type * as studio from "../studio.js";
import type * as templateGenerations from "../templateGenerations.js";
import type * as templates from "../templates.js";
import type * as testMocks from "../testMocks.js";
import type * as testing_cleanup from "../testing/cleanup.js";
import type * as testing_clerkBackendStub from "../testing/clerkBackendStub.js";
import type * as testing_seed from "../testing/seed.js";
import type * as urlImports from "../urlImports.js";
import type * as urlImportsActions from "../urlImportsActions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adCopy: typeof adCopy;
  "admin/audit": typeof admin_audit;
  "admin/playground": typeof admin_playground;
  "admin/playgroundActions": typeof admin_playgroundActions;
  ai: typeof ai;
  angleGenerations: typeof angleGenerations;
  "billing/syncPlan": typeof billing_syncPlan;
  "billing/webhookHandler": typeof billing_webhookHandler;
  board: typeof board;
  brandKits: typeof brandKits;
  crons: typeof crons;
  http: typeof http;
  invariant: typeof invariant;
  "lib/admin/requireAdmin": typeof lib_admin_requireAdmin;
  "lib/billing/capabilities": typeof lib_billing_capabilities;
  "lib/billing/claims": typeof lib_billing_claims;
  "lib/billing/index": typeof lib_billing_index;
  "lib/billing/planConfig": typeof lib_billing_planConfig;
  "lib/billing/provider": typeof lib_billing_provider;
  migrations: typeof migrations;
  onboardingProfiles: typeof onboardingProfiles;
  productImages: typeof productImages;
  productInspirations: typeof productInspirations;
  productInspirationsActions: typeof productInspirationsActions;
  products: typeof products;
  promptGenerations: typeof promptGenerations;
  promptSuggestions: typeof promptSuggestions;
  prompts: typeof prompts;
  r2: typeof r2;
  studio: typeof studio;
  templateGenerations: typeof templateGenerations;
  templates: typeof templates;
  testMocks: typeof testMocks;
  "testing/cleanup": typeof testing_cleanup;
  "testing/clerkBackendStub": typeof testing_clerkBackendStub;
  "testing/seed": typeof testing_seed;
  urlImports: typeof urlImports;
  urlImportsActions: typeof urlImportsActions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  imageGenPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"imageGenPool">;
  ingestPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"ingestPool">;
};
