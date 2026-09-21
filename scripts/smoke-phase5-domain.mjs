import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "../convex/_generated/api.js";

function onePagePdf() {
  const stream = "0.12 0.32 0.72 rg\n0 0 200 100 re\nf\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

// Keep authentication tokens inside the browser; return only acceptance facts.
async function privateRequest(page, path, source, authorize = true) {
  return page.evaluate(
    async ({ origin, path, source, authorize }) => {
      const headers = {};
      if (authorize) {
        const token = await window.Clerk.session.getToken({
          template: "convex",
        });
        if (!token) throw new Error("TEST_AUTH_REQUIRED");
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${origin}${path}`, {
        method: source ? "POST" : "GET",
        headers,
        body: source
          ? Uint8Array.from(atob(source), (c) => c.charCodeAt(0))
          : undefined,
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        cacheControl: response.headers.get("cache-control"),
        signature: Array.from(bytes.slice(0, 12)),
      };
    },
    {
      origin: process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
      path,
      source: source?.toString("base64"),
      authorize,
    },
  );
}

export async function smokePhase5Domain({
  page,
  employeePage,
  owner,
  employee,
  outsider,
  agencyId,
  vehicleId,
  expect,
}) {
  await owner.refresh();
  const workspace = await owner.client.query(api.identity.getWorkspace, {
    agencyId,
  });
  const currency = workspace.agency.currency;
  const maintenanceArgs = {
    agencyId,
    vehicleId,
    expectedRevision: 0,
    title: "Live maintenance acceptance",
    findings: "",
    scheduleIds: [],
    costLines: [],
    expectedCurrency: currency,
  };
  const startAt = Date.now() + 3_600_000;
  const endAt = startAt + 3_600_000;
  const race = await Promise.allSettled(
    [0, 1].map(() =>
      owner.client.mutation(api.maintenance.save, {
        ...maintenanceArgs,
        startAt,
        endAt,
        requestKey: randomUUID(),
      }),
    ),
  );
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = race.find((result) => result.status === "rejected");
  assert.match(String(rejected.reason), /ALLOCATION_CONFLICT/);
  const maintenanceId = race.find(
    (result) => result.status === "fulfilled",
  ).value;
  const allocations = () =>
    owner.client.query(api.operations.allocations, {
      agencyId,
      vehicleId,
      paginationOpts: { numItems: 25, cursor: null },
    });
  let ledger = await allocations();
  assert.equal(ledger.page.length, 1);
  assert.equal(ledger.page[0].source.id, maintenanceId);
  const manualId = await owner.client.mutation(api.operations.saveDowntime, {
    agencyId,
    vehicleId,
    expectedRevision: 0,
    startAt: endAt,
    endAt: endAt + 3_600_000,
    reason: "Adjacent preparation",
    requestKey: randomUUID(),
  });
  assert.equal((await allocations()).page.length, 2);
  await assert.rejects(
    employee.client.mutation(api.maintenance.save, {
      ...maintenanceArgs,
      requestKey: randomUUID(),
    }),
    /PERMISSION_DENIED/,
  );
  await assert.rejects(
    outsider.client.query(api.maintenance.get, {
      agencyId,
      id: maintenanceId,
    }),
  );
  const fleetVehicle = await owner.client.query(api.fleet.get, {
    agencyId,
    vehicleId,
  });
  await assert.rejects(
    owner.client.mutation(api.fleet.setStatus, {
      agencyId,
      vehicleId,
      expectedRevision: fleetVehicle.revision,
      lifecycle: "archived",
    }),
    /VEHICLE_HAS_WORK/,
  );

  const fields = [
    "fleetNumber",
    "plate",
    "vin",
    "make",
    "model",
    "trim",
    "year",
    "color",
    "transmission",
    "fuel",
    "seats",
    "doors",
    "branchId",
    "categoryId",
    "featureIds",
    "description",
    "notes",
  ];
  const secondVehicle = await owner.client.mutation(api.fleet.save, {
    agencyId,
    expectedRevision: 0,
    values: {
      ...Object.fromEntries(fields.map((key) => [key, fleetVehicle[key]])),
      fleetNumber: "LIVE-002",
      plate: "LIVE-002",
      vin: "",
    },
  });
  await owner.client.mutation(api.operations.saveDowntime, {
    agencyId,
    vehicleId: secondVehicle,
    expectedRevision: 0,
    startAt,
    endAt,
    reason: "Independent vehicle",
    requestKey: randomUUID(),
  });
  await owner.client.mutation(api.operations.manualIssue, {
    agencyId,
    vehicleId,
    expectedRevision: 0,
    reason: "Independent safety review",
    resolve: false,
    requestKey: randomUUID(),
  });
  await owner.client.mutation(api.maintenance.start, {
    agencyId,
    id: maintenanceId,
    expectedRevision: 1,
    requestKey: randomUUID(),
  });
  const completion = {
    agencyId,
    id: maintenanceId,
    expectedRevision: 2,
    findings: "Service completed and verified",
    costLines: [
      { kind: "parts", description: "Service parts", amountMinor: 10000 },
    ],
    expectedCurrency: currency,
    readinessConfirmed: true,
    requestKey: randomUUID(),
  };
  await owner.client.mutation(api.maintenance.complete, completion);
  await owner.client.mutation(api.maintenance.complete, completion);
  const completed = await owner.client.query(api.maintenance.get, {
    agencyId,
    id: maintenanceId,
  });
  assert.equal(completed.record.status, "completed");
  assert.equal(completed.expenses.length, 1);
  assert.equal(completed.expenses[0].amountMinor, 10000);
  await assert.rejects(
    employee.client.query(api.maintenance.get, {
      agencyId,
      id: maintenanceId,
    }),
    /PERMISSION_DENIED/,
  );
  await owner.client.mutation(api.identity.updateMemberRole, {
    agencyId,
    userId: employee.profile.id,
    roleKey: "READ_ONLY",
  });
  try {
    const readerView = await employee.client.query(api.maintenance.get, {
      agencyId,
      id: maintenanceId,
    });
    assert.equal(readerView.record.costLines, null);
    assert.equal(readerView.expenses, null);
  } finally {
    await owner.client.mutation(api.identity.updateMemberRole, {
      agencyId,
      userId: employee.profile.id,
      roleKey: "EMPLOYEE",
    });
  }
  ledger = await allocations();
  assert.deepEqual(
    ledger.page.map((row) => row._id),
    [manualId],
  );
  const readiness = await owner.client.query(api.operations.summary, {
    agencyId,
    vehicleId,
  });
  assert.equal(readiness.readiness, "blocked");
  assert(
    readiness.issues.some(
      (issue) => issue.reason === "Independent safety review",
    ),
  );
  await owner.client.mutation(api.maintenance.correctCost, {
    agencyId,
    id: maintenanceId,
    expectedRevision: completed.record.revision,
    replacementLines: [
      { kind: "parts", description: "Corrected parts", amountMinor: 8000 },
    ],
    expectedCurrency: currency,
    reason: "Supplier correction",
    requestKey: randomUUID(),
  });
  const corrected = await owner.client.query(api.maintenance.get, {
    agencyId,
    id: maintenanceId,
  });
  assert.deepEqual(
    corrected.expenses.map((row) => row.amountMinor),
    [10000, -10000, 8000],
  );
  console.log(
    "PASS P5 domain: real allocation race, adjacency, independent vehicles, archive safety, completion replay, source-specific release, retained safety issue and private costs.",
  );

  const task = {
    agencyId,
    vehicleId,
    expectedRevision: 0,
    title: "Assigned employee acceptance",
    description: "Review evidence",
    assigneeId: employee.profile.id,
    status: "open",
    priority: "normal",
    requestKey: randomUUID(),
  };
  const taskId = await owner.client.mutation(api.tasks.save, task);
  await assert.rejects(
    employee.client.mutation(api.tasks.save, {
      ...task,
      id: taskId,
      expectedRevision: 1,
      assigneeId: owner.profile.id,
      requestKey: randomUUID(),
    }),
    /PERMISSION_DENIED/,
  );
  await employee.client.mutation(api.tasks.save, {
    ...task,
    id: taskId,
    expectedRevision: 1,
    status: "in_progress",
    requestKey: randomUUID(),
  });
  const assigned = await employee.client.query(api.tasks.list, {
    agencyId,
    status: "in_progress",
    mine: false,
    paginationOpts: { numItems: 25, cursor: null },
  });
  assert.deepEqual(
    assigned.page.map((row) => row._id),
    [taskId],
  );

  const types = await owner.client.query(api.operationCatalogs.documentTypes, {
    agencyId,
  });
  const documentId = await owner.client.mutation(
    api.vehicleDocuments.saveDraft,
    {
      agencyId,
      vehicleId,
      typeId: types.find((type) => type.code === "REG")._id,
      expectedRevision: 0,
      number: "REG-PDF",
      issuer: "Synthetic acceptance",
      issuedDate: "",
      expiryDate: "",
      requestKey: randomUUID(),
    },
  );
  const begin = () =>
    owner.client.mutation(api.privateFiles.begin, {
      agencyId,
      vehicleId,
      owner: { kind: "document", id: documentId },
      expectedRevision: 1,
    });
  const invalidIntent = await begin();
  assert.equal(
    (
      await privateRequest(
        page,
        `/private-files/upload/${invalidIntent}`,
        Buffer.from("%PDF-invalid"),
      )
    ).status,
    202,
  );
  await expect
    .poll(
      async () =>
        (
          await owner.client.query(api.privateFiles.status, {
            intentId: invalidIntent,
          })
        )?.status,
      { timeout: 45000 },
    )
    .toBe("failed");
  const intentId = await begin();
  assert.equal(
    (
      await privateRequest(
        page,
        `/private-files/upload/${intentId}`,
        onePagePdf(),
      )
    ).status,
    202,
  );
  await expect
    .poll(
      async () =>
        (
          await owner.client.query(api.privateFiles.status, {
            intentId,
          })
        )?.status,
      { timeout: 45000 },
    )
    .toBe("done");
  assert.equal(
    (
      await privateRequest(
        page,
        `/private-files/upload/${intentId}`,
        onePagePdf(),
      )
    ).status,
    400,
  );
  const { fileId } = await owner.client.query(api.privateFiles.status, {
    intentId,
  });
  const manifest = await owner.client.query(api.privateFiles.manifest, {
    agencyId,
    fileId,
  });
  assert.equal(manifest.length, 1);
  const path = `/private-files/download/${fileId}/${manifest[0].id}`;
  const download = await privateRequest(page, path);
  assert.equal(download.status, 200);
  assert.equal(download.contentType, "image/webp");
  assert.equal(download.cacheControl, "private, no-store");
  assert.equal(Buffer.from(download.signature.slice(0, 4)).toString(), "RIFF");
  assert.equal(Buffer.from(download.signature.slice(8, 12)).toString(), "WEBP");
  assert.equal(
    (await privateRequest(page, path, undefined, false)).status,
    401,
  );
  assert.equal((await privateRequest(employeePage, path)).status, 404);
  await assert.rejects(
    outsider.client.query(api.privateFiles.manifest, { agencyId, fileId }),
  );
  console.log(
    "PASS P5 domain: employee assignment restrictions, malformed-file recovery, live PDF reconstruction, single-use upload, authenticated WebP download and denied private access.",
  );
  return { maintenanceId };
}
