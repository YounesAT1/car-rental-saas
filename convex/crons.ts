import { cronJobs, makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
const privateExpire = makeFunctionReference<
  "mutation",
  Record<string, never>,
  null
>("privateFiles:expire") as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, never>,
  null
>;
const privateSweep = makeFunctionReference<
  "mutation",
  { cursor: string | null },
  null
>("privateFiles:sweep") as unknown as FunctionReference<
  "mutation",
  "internal",
  { cursor: string | null },
  null
>;
crons.interval(
  "expire fleet uploads",
  { minutes: 5 },
  internal.fleetPhotos.expire,
  {},
);
crons.interval(
  "reclaim interrupted fleet photo uploads",
  { hours: 6 },
  internal.fleetPhotos.sweep,
  { cursor: null },
);
crons.interval("expire private uploads", { minutes: 5 }, privateExpire, {});
crons.interval(
  "reclaim interrupted private uploads",
  { hours: 6 },
  privateSweep,
  { cursor: null },
);
crons.interval(
  "refresh vehicle readiness and maintenance tasks",
  { minutes: 5 },
  internal.operations.sweep,
  { cursor: null },
);
export default crons;
