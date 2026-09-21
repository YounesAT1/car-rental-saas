import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "../convex/_generated/api.js";
import en from "../src/i18n/messages/en.json" with { type: "json" };

export async function smokePhase5WorkspaceForms({
  page,
  employeePage,
  owner,
  employee,
  outsider,
  agencyId,
  vehicleId,
  inspectionId,
  damageId,
  maintenanceId,
  base,
  expect,
  responsiveMatrix,
}) {
  const m = en.common.operations;
  const vehicleUrl = `${base}/app/${agencyId}/fleet/${vehicleId}/operations`;
  const parent = { agencyId, vehicleId };
  const paginationOpts = { cursor: null, numItems: 25 };
  const workspace = await owner.client.query(api.identity.getWorkspace, {
    agencyId,
  });
  const currency = workspace.agency.currency;
  async function dialog(label) {
    const modal = page.getByRole("alertdialog");
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: label, exact: true }).click();
    await expect(modal).toBeHidden();
  }
  const catalog = (id) => page.locator(`[data-catalog-id="${id}"]`);
  const mileageRows = () =>
    owner.client.query(api.mileage.list, { ...parent, paginationOpts });

  // Correct an observation without replacing its audit row or observation time.
  await page.goto(vehicleUrl);
  let mileage = await mileageRows();
  const original = mileage.page.find((row) => row.active);
  assert(original);
  await page
    .locator(`[data-mileage-id="${original._id}"]`)
    .getByRole("button", { name: m.correctMileage, exact: true })
    .click();
  await page.locator("#correction-value").fill("12010");
  await page
    .locator("#correction-reason")
    .fill("Rechecked the original instrument photo");
  await responsiveMatrix("mileage-correction");
  await expect(page.locator("#correction-value")).toHaveValue("12010");
  await page
    .getByRole("button", { name: m.saveCorrection, exact: true })
    .click();
  await expect(page.locator(".operations-correction-form")).toHaveCount(0);
  mileage = await mileageRows();
  const correction = mileage.page.find(
    (row) => row.supersedesId === original._id,
  );
  assert(correction);
  assert.equal(correction.observedAt, original.observedAt);
  assert.equal(correction.meters, 12_010_000);
  assert.equal(
    mileage.page.find((row) => row._id === original._id).active,
    false,
  );
  const schedules = await owner.client.query(api.maintenance.schedules, {
    ...parent,
    active: true,
  });
  assert.equal(
    schedules.find((row) => row.service === "Oil service").baselineValid,
    false,
  );

  await page
    .getByRole("button", { name: m.replaceOdometer, exact: true })
    .click();
  await page.locator("#correction-value").fill("25");
  await page
    .locator("#correction-reason")
    .fill("Replacement instrument starts at 25 km");
  await responsiveMatrix("odometer-replacement");
  await page
    .getByRole("button", { name: m.saveCorrection, exact: true })
    .click();
  await expect(page.locator(".operations-correction-form")).toHaveCount(0);
  const projection = await owner.client.query(api.operations.summary, parent);
  assert.equal(projection.guard.mileageMeters, 12_010_000);
  const replacement = (await mileageRows()).page.find(
    (row) => row._id === projection.guard.latestMileageId,
  );
  assert.equal(replacement.kind, "replacement");
  assert.equal(replacement.value, 25);
  assert.equal(replacement.offset, 11_985_000);

  // A manual hold remains active when another source finishes its repair.
  await page
    .getByRole("button", { name: m.addManualIssue, exact: true })
    .click();
  await page.locator("#availability-reason").fill("Spare key is missing");
  await responsiveMatrix("manual-readiness-hold");
  await page
    .locator("form")
    .filter({ has: page.locator("#availability-reason") })
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(page.locator("#availability-reason")).toHaveCount(0);
  let summary = await owner.client.query(api.operations.summary, parent);
  const hold = summary.issues.find(
    (row) =>
      row.source.kind === "manual" && row.reason === "Spare key is missing",
  );
  assert(hold);
  assert.equal(summary.readiness, "blocked");

  await page.getByRole("button", { name: m.addDowntime, exact: true }).click();
  const tomorrow = new Date(Date.now() + 24 * 3600_000);
  const local = (date) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: workspace.agency.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(date)
      .replace(" ", "T");
  await page.locator("#downtime-start").fill(local(tomorrow));
  await page
    .locator("#downtime-end")
    .fill(local(new Date(tomorrow.getTime() + 3600_000)));
  await page.locator("#availability-reason").fill("Preparation bay reserved");
  await responsiveMatrix("manual-downtime");
  await page
    .locator("form")
    .filter({ has: page.locator("#availability-reason") })
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(page.locator("#availability-reason")).toHaveCount(0);
  const allocated = await owner.client.query(api.operations.allocationHistory, {
    ...parent,
    blocking: true,
    paginationOpts,
  });
  const window = allocated.page.find(
    (row) => row.reason === "Preparation bay reserved",
  );
  assert(window);
  assert.equal(window.endAt - window.startAt, 3600_000);
  const downtimeRow = page.locator(".operations-history-list > div").filter({
    has: page.getByText("Preparation bay reserved", { exact: true }),
  });
  await downtimeRow
    .getByRole("button", { name: m.releaseDowntime, exact: true })
    .click();
  await dialog(m.releaseDowntime);
  await expect(downtimeRow).toHaveCount(0);
  const released = await owner.client.query(api.operations.allocationHistory, {
    ...parent,
    blocking: false,
    paginationOpts,
  });
  assert.equal(
    released.page.find((row) => row._id === window._id).blocking,
    false,
  );

  // Emergency admission has no invented end date and retains the unrelated hold.
  await page.goto(`${base}/app/${agencyId}/maintenance`);
  await page
    .getByRole("button", { name: m.createMaintenance, exact: true })
    .click();
  await page.getByRole("checkbox", { name: m.emergency, exact: true }).check();
  await page.locator("#maintenance-vehicle").click();
  await page
    .getByRole("option", { name: "AT-001 · Dacia Sandero", exact: true })
    .click();
  await page.locator("#maintenance-title").fill("Emergency starter repair");
  await page
    .locator("#maintenance-findings")
    .fill("Starter failed in the depot");
  await expect(page.locator("#maintenance-end")).toHaveCount(0);
  await responsiveMatrix("emergency-maintenance");
  await page
    .locator("form")
    .getByRole("button", { name: m.createMaintenance, exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/app/${agencyId}/maintenance/[a-z0-9]+$`),
  );
  const emergencyId = page.url().split("/").at(-1);
  const emergency = await owner.client.query(api.maintenance.get, {
    agencyId,
    id: emergencyId,
  });
  assert.equal(emergency.record.emergency, true);
  assert.equal(emergency.record.status, "in_progress");
  assert.equal(emergency.record.endAt, undefined);
  await page
    .locator("#maintenance-complete-findings")
    .fill("Starter replaced and road tested");
  await page.getByRole("button", { name: m.addCostLine, exact: true }).click();
  await page
    .locator("#maintenance-complete-description-0")
    .fill("Starter parts");
  await page.locator("#maintenance-complete-amount-0").fill("42.35");
  await page.getByRole("checkbox", { name: m.ready, exact: true }).check();
  await responsiveMatrix("maintenance-costs");
  await page
    .locator("form")
    .getByRole("button", { name: m.complete, exact: true })
    .click();
  await expect(page.locator("#maintenance-complete-findings")).toHaveCount(0);
  const finished = await owner.client.query(api.maintenance.get, {
    agencyId,
    id: emergencyId,
  });
  assert.equal(finished.expenses[0].amountMinor, 4235);
  summary = await owner.client.query(api.operations.summary, parent);
  assert(summary.issues.some((row) => row._id === hold._id));
  assert(
    !summary.issues.some(
      (row) =>
        row.source.kind === "maintenance" && row.source.id === emergencyId,
    ),
  );

  // Cost edits capture the revision and append reversing/replacement evidence.
  await page.goto(`${base}/app/${agencyId}/maintenance/${maintenanceId}`);
  await page.getByRole("button", { name: m.correctCost, exact: true }).click();
  await page.locator("#cost-correction-amount-0").fill("95.50");
  await page
    .locator("#cost-correction-reason")
    .fill("Supplier corrected the parts invoice");
  let work = await owner.client.query(api.maintenance.get, {
    agencyId,
    id: maintenanceId,
  });
  const priorExpenseCount = work.expenses.length;
  const priorReversalCount = work.expenses.filter(
    (expense) => expense.reversesId,
  ).length;
  await owner.client.mutation(api.maintenance.correctCost, {
    agencyId,
    id: maintenanceId,
    expectedRevision: work.record.revision,
    replacementLines: [
      {
        kind: "parts",
        description: "Remote invoice correction",
        amountMinor: 9000,
      },
    ],
    expectedCurrency: currency,
    reason: "Another manager reconciled the invoice",
    requestKey: randomUUID(),
  });
  await expect(
    page.locator(".operations-cost-correction").getByRole("alert"),
  ).toHaveText(m.conflict);
  await expect(page.locator("#cost-correction-amount-0")).toHaveValue("95.50");
  await expect(
    page.getByRole("button", { name: m.saveCorrection, exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: m.reload, exact: true }).click();
  await dialog(m.discardChanges);
  await expect(page.locator("#cost-correction-amount-0")).toHaveValue("90.00");
  await page.locator("#cost-correction-amount-0").fill("95.50");
  await page
    .locator("#cost-correction-reason")
    .fill("Supplier corrected the parts invoice");
  await responsiveMatrix("maintenance-cost-correction");
  await page
    .getByRole("button", { name: m.saveCorrection, exact: true })
    .click();
  await expect(page.locator(".operations-cost-correction")).toHaveCount(0);
  work = await owner.client.query(api.maintenance.get, {
    agencyId,
    id: maintenanceId,
  });
  assert.equal(work.record.costLines[0].amountMinor, 10000);
  assert.equal(work.expenses.length, priorExpenseCount + 4);
  assert.equal(
    work.expenses.reduce((sum, item) => sum + item.amountMinor, 0),
    9550,
  );
  const reversals = work.expenses.filter((expense) => expense.reversesId);
  assert.equal(reversals.length, priorReversalCount + 2);
  const expensesById = new Map(
    work.expenses.map((expense) => [expense._id, expense]),
  );
  for (const reversal of reversals) {
    const reversed = expensesById.get(reversal.reversesId);
    assert(reversed);
    assert.equal(reversal.amountMinor, -reversed.amountMinor);
  }

  await page.goto(vehicleUrl);
  await page
    .locator(".operations-history-list > div")
    .filter({
      has: page.getByText("Spare key is missing", { exact: true }),
    })
    .getByRole("button", { name: m.resolveIssue, exact: true })
    .click();
  await page
    .locator("#availability-reason")
    .fill("Spare key received and tested by staff");
  await page
    .locator("form")
    .filter({ has: page.locator("#availability-reason") })
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(page.locator("#availability-reason")).toHaveCount(0);
  const issueHistory = await owner.client.query(api.operations.issueHistory, {
    ...parent,
    active: false,
    paginationOpts,
  });
  assert.equal(
    issueHistory.page.find((row) => row._id === hold._id).resolution,
    "Spare key received and tested by staff",
  );

  // Completed evidence stays locked; amendments are separate linked records.
  await page.goto(`${base}/app/${agencyId}/inspections/${inspectionId}`);
  const locked = await owner.client.query(api.inspections.get, {
    agencyId,
    id: inspectionId,
  });
  await page
    .getByRole("button", { name: m.amendInspection, exact: true })
    .click();
  await page
    .locator("#inspection-amendment-reason")
    .fill("Clarify the readiness findings");
  await responsiveMatrix("inspection-amendment");
  await page
    .locator("form")
    .getByRole("button", { name: m.amendInspection, exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/app/${agencyId}/inspections/[a-z0-9]+$`),
  );
  await expect(
    page.getByRole("link", { name: m.originalInspection, exact: true }),
  ).toBeVisible();
  const amendmentId = page.url().split("/").at(-1);
  await page
    .locator("#inspection-notes")
    .fill("Clarified readiness findings; no checklist changes");
  await page
    .getByRole("checkbox", { name: m.acknowledgment, exact: true })
    .check();
  await page.getByRole("button", { name: m.saveDraft, exact: true }).click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: m.complete, exact: true }).click();
  await expect(page.locator(".operations-heading p").last()).toContainText(
    m.completed,
  );
  const amendment = await owner.client.query(api.inspections.amendment, {
    agencyId,
    originalId: inspectionId,
  });
  assert.equal(amendment._id, amendmentId);
  assert.equal(amendment.amendsId, inspectionId);
  assert.equal(amendment.status, "completed");
  assert.deepEqual(
    (
      await owner.client.query(api.inspections.get, {
        agencyId,
        id: inspectionId,
      })
    ).items,
    locked.items,
  );
  await assert.rejects(
    outsider.client.query(api.inspections.amendment, {
      agencyId,
      originalId: inspectionId,
    }),
  );
  await page.goto(`${base}/app/${agencyId}/inspections`);
  await page
    .getByRole("button", { name: m.createInspection, exact: true })
    .click();
  await page.locator("#inspection-vehicle").click();
  await page
    .getByRole("option", { name: "AT-001 · Dacia Sandero", exact: true })
    .click();
  await page.locator("#inspection-template").click();
  await page
    .getByRole("option", { name: "Daily readiness", exact: true })
    .click();
  const scheduledAt = tomorrow.getTime() + 24 * 3600_000;
  await page.locator("#inspection-start").fill(local(new Date(scheduledAt)));
  await page
    .locator("#inspection-end")
    .fill(local(new Date(scheduledAt + 3600_000)));
  await page
    .locator("form")
    .getByRole("button", { name: m.createInspection, exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/app/${agencyId}/inspections/[a-z0-9]+$`),
  );
  await expect(page.locator(".operations-checklist-row")).toHaveCount(6);
  const cancelledId = page.url().split("/").at(-1);
  const held = await owner.client.query(api.operations.allocationHistory, {
    ...parent,
    blocking: true,
    paginationOpts,
  });
  assert(
    held.page.some(
      (row) =>
        row.source.kind === "inspection" && row.source.id === cancelledId,
    ),
  );
  await page
    .locator("#inspection-notes")
    .fill("Inspection rescheduled by depot staff");
  await page
    .getByRole("button", { name: m.cancelInspection, exact: true })
    .click();
  await dialog(m.cancelInspection);
  await expect(page.locator(".operations-heading p").last()).toContainText(
    m.cancelled,
  );
  const afterCancel = await owner.client.query(
    api.operations.allocationHistory,
    { ...parent, blocking: false, paginationOpts },
  );
  assert(
    afterCancel.page.some(
      (row) =>
        row.source.kind === "inspection" && row.source.id === cancelledId,
    ),
  );

  // Catalog editing and lifecycle preserve versioned checklist snapshots.
  await page.goto(`${base}/app/${agencyId}/settings/operations`);
  const types = await owner.client.query(api.operationCatalogs.documentTypes, {
    agencyId,
  });
  const reg = types.find((row) => row.code === "REG");
  await catalog(reg._id)
    .getByRole("button", { name: m.editCatalog, exact: true })
    .click();
  await page.locator("#document-type-en").fill("Vehicle registration");
  await page
    .locator("form")
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(
    page.getByText("Vehicle registration", { exact: true }),
  ).toBeVisible();
  await catalog(reg._id)
    .getByRole("button", { name: m.archiveCatalog, exact: true })
    .click();
  await dialog(m.archiveCatalog);
  await expect(
    catalog(reg._id).getByRole("button", {
      name: m.restoreCatalog,
      exact: true,
    }),
  ).toBeVisible();
  await catalog(reg._id)
    .getByRole("button", { name: m.restoreCatalog, exact: true })
    .click();
  await expect(
    catalog(reg._id).getByRole("button", {
      name: m.archiveCatalog,
      exact: true,
    }),
  ).toBeVisible();
  let templates = await owner.client.query(api.operationCatalogs.templates, {
    agencyId,
  });
  const daily = templates.find((row) => row.code === "DAILY");
  await catalog(daily._id)
    .getByRole("button", { name: m.editCatalog, exact: true })
    .click();
  await page
    .getByRole("button", { name: m.addChecklistItem, exact: true })
    .click();
  await page.locator("#template-item-6-code").fill("EV_CHARGE");
  await page.locator("#template-item-6-en").fill("Battery charging port");
  await page.locator("#template-item-6-fr").fill("Prise de recharge");
  await page.locator("#template-item-6-ar").fill("منفذ شحن البطارية");
  const item = page.locator(".operations-template-item").last();
  await item.getByRole("checkbox", { name: m.safety, exact: true }).check();
  await expect(
    item.getByRole("checkbox", { name: m.required, exact: true }),
  ).toBeChecked();
  await expect(
    item.getByRole("checkbox", { name: m.required, exact: true }),
  ).toBeDisabled();
  await responsiveMatrix("custom-template-editor");
  await page
    .locator("form")
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(page.locator(".operations-template-item")).toHaveCount(0);
  templates = await owner.client.query(api.operationCatalogs.templates, {
    agencyId,
  });
  const revised = templates.find((row) => row.code === "DAILY");
  assert.equal(revised.version, 2);
  assert.equal(revised.items.length, 7);
  assert.equal(
    (
      await owner.client.query(api.inspections.get, {
        agencyId,
        id: inspectionId,
      })
    ).items.length,
    6,
  );
  await catalog(revised._id)
    .getByRole("button", { name: m.archiveCatalog, exact: true })
    .click();
  await dialog(m.archiveCatalog);
  await expect(catalog(revised._id)).toHaveCount(0);
  await page
    .getByRole("button", { name: m.archivedCatalog, exact: true })
    .click();
  await catalog(revised._id)
    .getByRole("button", { name: m.restoreCatalog, exact: true })
    .click();
  await expect(catalog(revised._id)).toHaveCount(0);
  await expect(
    catalog(daily._id).getByRole("button", {
      name: m.restoreCatalog,
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: m.active, exact: true }).click();
  const vendors = await owner.client.query(api.operationCatalogs.vendors, {
    agencyId,
  });
  const vendor = vendors.find((row) => row.name === "Atlas Service");
  await catalog(vendor._id)
    .getByRole("button", { name: m.editCatalog, exact: true })
    .click();
  await page.locator("#vendor-phone").fill("+212500000001");
  await page
    .locator("form")
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(catalog(vendor._id)).toContainText("+212500000001");
  await catalog(vendor._id)
    .getByRole("button", { name: m.archiveCatalog, exact: true })
    .click();
  await dialog(m.archiveCatalog);
  await expect(
    catalog(vendor._id).getByRole("button", {
      name: m.restoreCatalog,
      exact: true,
    }),
  ).toBeVisible();
  await catalog(vendor._id)
    .getByRole("button", { name: m.restoreCatalog, exact: true })
    .click();
  await expect(
    catalog(vendor._id).getByRole("button", {
      name: m.archiveCatalog,
      exact: true,
    }),
  ).toBeVisible();

  // Assignment is manager-owned; employee editing preserves assignee/source.
  await page.goto(`${base}/app/${agencyId}/tasks`);
  const taskCard = page
    .locator(".operations-row")
    .filter({ hasText: "Review operational evidence" });
  await taskCard
    .getByRole("button", { name: m.editCatalog, exact: true })
    .click();
  await page.locator("#task-edit-assignee").click();
  const people = await owner.client.query(api.tasks.assignees, { agencyId });
  await page
    .getByRole("option", {
      name: people.find((person) => person.id === employee.profile.id).name,
      exact: true,
    })
    .click();
  await page
    .locator("#task-edit-description")
    .fill("Assigned evidence review to depot staff");
  await responsiveMatrix("task-assignment");
  await page
    .locator("form")
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(page.locator("#task-edit-description")).toHaveCount(0);
  await employeePage.goto(`${base}/app/${agencyId}/tasks`);
  const employeeTask = employeePage
    .locator(".operations-row")
    .filter({ hasText: "Review operational evidence" });
  await employeeTask
    .getByRole("button", { name: m.editCatalog, exact: true })
    .click();
  await expect(employeePage.locator("#task-edit-assignee")).toHaveCount(0);
  await employeePage
    .locator("#task-edit-description")
    .fill("Evidence reviewed by assigned depot staff");
  await employeePage
    .locator("form")
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(employeePage.locator("#task-edit-description")).toHaveCount(0);
  const assigned = await employee.client.query(api.tasks.list, {
    agencyId,
    status: "open",
    mine: true,
    paginationOpts,
  });
  const persistedTask = assigned.page.find(
    (row) => row.title === "Review operational evidence",
  );
  assert.equal(persistedTask.assigneeId, employee.profile.id);
  assert.equal(
    persistedTask.description,
    "Evidence reviewed by assigned depot staff",
  );

  await page.goto(`${base}/app/${agencyId}/damage/${damageId}`);
  await page.getByRole("button", { name: m.editCatalog, exact: true }).click();
  await page.locator("#damage-edit-responsibility").click();
  await page
    .getByRole("option", { name: m.thirdPartyResponsibility, exact: true })
    .click();
  await page.getByRole("checkbox", { name: m.disputed, exact: true }).check();
  await page.locator("#damage-edit-estimate").fill("125.50");
  await responsiveMatrix("damage-assessment");
  await page
    .locator("form")
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(page.locator("#damage-edit-description")).toHaveCount(0);
  const damage = await owner.client.query(api.damage.get, {
    agencyId,
    id: damageId,
  });
  assert.equal(damage.responsibility, "third_party");
  assert.equal(damage.disputed, true);
  assert.equal(damage.estimateMinor, 12550);

  await owner.client.mutation(api.identity.updateMemberRole, {
    agencyId,
    userId: employee.profile.id,
    roleKey: "READ_ONLY",
  });
  try {
    await employeePage.goto(
      `${base}/app/${agencyId}/maintenance/${maintenanceId}`,
    );
    await expect(
      employeePage.getByRole("heading", {
        name: "Live maintenance acceptance",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      employeePage.getByRole("button", { name: m.correctCost, exact: true }),
    ).toHaveCount(0);
    await expect(employeePage.locator(".operations-expense")).toHaveCount(0);
    await employeePage.goto(vehicleUrl);
    await expect(
      employeePage.getByRole("heading", {
        name: m.vehicleOperations,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      employeePage.getByRole("button", {
        name: m.replaceOdometer,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      employeePage.getByRole("button", { name: m.addDowntime, exact: true }),
    ).toHaveCount(0);
    await employeePage.goto(
      `${base}/app/${agencyId}/inspections/${inspectionId}`,
    );
    await expect(
      employeePage.getByRole("link", { name: m.viewAmendment, exact: true }),
    ).toBeVisible();
    await expect(
      employeePage.getByRole("button", {
        name: m.amendInspection,
        exact: true,
      }),
    ).toHaveCount(0);
    await assert.rejects(
      employee.client.mutation(api.operationCatalogs.setTemplateActive, {
        agencyId,
        id: revised._id,
        expectedRevision: revised.revision + 2,
        active: false,
        requestKey: randomUUID(),
      }),
      /PERMISSION_DENIED/,
    );
  } finally {
    await owner.client.mutation(api.identity.updateMemberRole, {
      agencyId,
      userId: employee.profile.id,
      roleKey: "EMPLOYEE",
    });
  }
  console.log(
    "PASS P5 workspace forms: audited mileage correction/replacement, manual downtime/readiness, emergency work and integer costs, revision-conflict recovery, immutable cost corrections, inspection amendments, custom template versions/lifecycle, document/vendor editing, task reassignment/employee notes, damage responsibility/estimates and read-only controls.",
  );
}
