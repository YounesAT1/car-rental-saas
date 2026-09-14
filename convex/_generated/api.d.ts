/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agencySettings from "../agencySettings.js";
import type * as branches from "../branches.js";
import type * as crons from "../crons.js";
import type * as damage from "../damage.js";
import type * as fleet from "../fleet.js";
import type * as fleetCatalogs from "../fleetCatalogs.js";
import type * as fleetPhotos from "../fleetPhotos.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as identity from "../identity.js";
import type * as inspections from "../inspections.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_fleet from "../lib/fleet.js";
import type * as lib_fleetValidators from "../lib/fleetValidators.js";
import type * as lib_maintenance from "../lib/maintenance.js";
import type * as lib_mileage from "../lib/mileage.js";
import type * as lib_operations from "../lib/operations.js";
import type * as lib_operationsValidators from "../lib/operationsValidators.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_privateFiles from "../lib/privateFiles.js";
import type * as lib_processPhoto from "../lib/processPhoto.js";
import type * as lib_processPrivateDocument from "../lib/processPrivateDocument.js";
import type * as lib_settingsValidators from "../lib/settingsValidators.js";
import type * as maintenance from "../maintenance.js";
import type * as mileage from "../mileage.js";
import type * as operationCatalogs from "../operationCatalogs.js";
import type * as operations from "../operations.js";
import type * as operationsSchema from "../operationsSchema.js";
import type * as photoUpload from "../photoUpload.js";
import type * as privateFileHttp from "../privateFileHttp.js";
import type * as privateFileProcessing from "../privateFileProcessing.js";
import type * as privateFiles from "../privateFiles.js";
import type * as tasks from "../tasks.js";
import type * as testing from "../testing.js";
import type * as vehicleDocuments from "../vehicleDocuments.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agencySettings: typeof agencySettings;
  branches: typeof branches;
  crons: typeof crons;
  damage: typeof damage;
  fleet: typeof fleet;
  fleetCatalogs: typeof fleetCatalogs;
  fleetPhotos: typeof fleetPhotos;
  health: typeof health;
  http: typeof http;
  identity: typeof identity;
  inspections: typeof inspections;
  "lib/auth": typeof lib_auth;
  "lib/fleet": typeof lib_fleet;
  "lib/fleetValidators": typeof lib_fleetValidators;
  "lib/maintenance": typeof lib_maintenance;
  "lib/mileage": typeof lib_mileage;
  "lib/operations": typeof lib_operations;
  "lib/operationsValidators": typeof lib_operationsValidators;
  "lib/permissions": typeof lib_permissions;
  "lib/privateFiles": typeof lib_privateFiles;
  "lib/processPhoto": typeof lib_processPhoto;
  "lib/processPrivateDocument": typeof lib_processPrivateDocument;
  "lib/settingsValidators": typeof lib_settingsValidators;
  maintenance: typeof maintenance;
  mileage: typeof mileage;
  operationCatalogs: typeof operationCatalogs;
  operations: typeof operations;
  operationsSchema: typeof operationsSchema;
  photoUpload: typeof photoUpload;
  privateFileHttp: typeof privateFileHttp;
  privateFileProcessing: typeof privateFileProcessing;
  privateFiles: typeof privateFiles;
  tasks: typeof tasks;
  testing: typeof testing;
  vehicleDocuments: typeof vehicleDocuments;
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

export declare const components: {};
