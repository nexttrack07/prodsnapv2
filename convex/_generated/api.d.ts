/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as board from "../board.js";
import type * as crons from "../crons.js";
import type * as invariant from "../invariant.js";
import type * as migrations from "../migrations.js";
import type * as productImages from "../productImages.js";
import type * as products from "../products.js";
import type * as prompts from "../prompts.js";
import type * as r2 from "../r2.js";
import type * as studio from "../studio.js";
import type * as templates from "../templates.js";
import type * as testMocks from "../testMocks.js";
import type * as testing_cleanup from "../testing/cleanup.js";
import type * as testing_seed from "../testing/seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  board: typeof board;
  crons: typeof crons;
  invariant: typeof invariant;
  migrations: typeof migrations;
  productImages: typeof productImages;
  products: typeof products;
  prompts: typeof prompts;
  r2: typeof r2;
  studio: typeof studio;
  templates: typeof templates;
  testMocks: typeof testMocks;
  "testing/cleanup": typeof testing_cleanup;
  "testing/seed": typeof testing_seed;
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
