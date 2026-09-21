import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "../convex/_generated/api.js";
import en from "../src/i18n/messages/en.json" with { type: "json" };

export async function smokePhase5Schedules({
  page,
  employeePage,
  owner,
  employee,
  outsider,
  agencyId,
  vehicleId,
  base,
  expect,
  responsiveMatrix,
}) {
  const m = en.common.operations;
  const url = `${base}/app/${agencyId}/maintenance/schedules?vehicleId=${vehicleId}`;
  const query = { agencyId, vehicleId, active: true };
  const readSchedules = () =>
    owner.client.query(api.maintenance.schedules, query);
  const card = (id) => page.locator(`[data-schedule-id="${id}"]`);
  async function acceptDialog(label) {
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await page.getByRole("link", { name: m.schedules, exact: true }).click();
  await expect(page).toHaveURL(url);
  await expect(
    page.getByRole("heading", { name: m.schedules, exact: true }),
  ).toBeVisible();
  const add = page.getByRole("button", { name: m.addSchedule, exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel(m.scheduleService, { exact: true }),
  ).toBeFocused();
  await page.getByLabel(m.scheduleService, { exact: true }).fill("Oil service");
  await page.getByRole("button", { name: m.saveSchedule, exact: true }).click();
  await expect(page.locator("#schedule-interval-hint")).toHaveText(
    m.intervalInvalid,
  );
  await page.getByLabel(m.intervalDays, { exact: true }).fill("180");
  await page.getByLabel(m.intervalDistance, { exact: true }).fill("10000");
  await responsiveMatrix("schedules-edit");
  await expect(page.getByLabel(m.scheduleService, { exact: true })).toHaveValue(
    "Oil service",
  );
  await page.getByRole("button", { name: m.cancel, exact: true }).click();
  await acceptDialog(en.common.settings.cancel);
  await expect(page.getByLabel(m.intervalDays, { exact: true })).toHaveValue(
    "180",
  );
  await page.getByRole("button", { name: m.saveSchedule, exact: true }).click();
  await expect(page.locator(".operations-schedule-form")).toHaveCount(0);
  let rows = await readSchedules();
  const oil = rows.find((row) => row.service === "Oil service");
  assert(oil);
  assert.equal(oil.meters, 10_000_000);
  assert.equal(oil.baselineValid, false);
  await expect(
    card(oil._id).getByText(m.unknownBaseline, { exact: true }),
  ).toBeVisible();

  await add.click();
  await page
    .getByLabel(m.scheduleService, { exact: true })
    .fill("Tyre service");
  await page.getByLabel(m.intervalDays, { exact: true }).fill("90");
  await page.getByRole("button", { name: m.saveSchedule, exact: true }).click();
  await expect(page.locator(".operations-schedule-form")).toHaveCount(0);
  const tyres = (await readSchedules()).find(
    (row) => row.service === "Tyre service",
  );
  assert(tyres);

  await card(oil._id)
    .getByRole("button", { name: m.editSchedule, exact: true })
    .click();
  await page
    .getByLabel(m.scheduleService, { exact: true })
    .fill("My unsaved service");
  await owner.client.mutation(api.maintenance.saveSchedule, {
    ...query,
    id: oil._id,
    expectedRevision: oil.revision,
    service: "Revised oil service",
    days: 90,
    meters: oil.meters,
    requestKey: randomUUID(),
  });
  await expect(
    page.locator(".operations-schedule-form").getByRole("alert"),
  ).toHaveText(m.conflict);
  await expect(page.getByLabel(m.scheduleService, { exact: true })).toHaveValue(
    "My unsaved service",
  );
  await expect(
    page.getByRole("button", { name: m.saveSchedule, exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: m.reload, exact: true }).click();
  await acceptDialog(en.common.settings.cancel);
  await expect(page.getByLabel(m.scheduleService, { exact: true })).toHaveValue(
    "My unsaved service",
  );
  await page.getByRole("button", { name: m.reload, exact: true }).click();
  await acceptDialog(m.discardChanges);
  await expect(page.getByLabel(m.scheduleService, { exact: true })).toHaveValue(
    "Revised oil service",
  );
  await page.getByLabel(m.scheduleService, { exact: true }).fill("Oil service");
  await page.getByLabel(m.intervalDays, { exact: true }).fill("180");
  await page.getByRole("button", { name: m.saveSchedule, exact: true }).click();
  await expect(page.locator(".operations-schedule-form")).toHaveCount(0);

  await card(oil._id)
    .getByRole("button", { name: m.archiveSchedule, exact: true })
    .click();
  await acceptDialog(m.archiveSchedule);
  await expect(card(oil._id)).toHaveCount(0);
  await page.getByRole("button", { name: m.archived, exact: true }).click();
  await expect(card(oil._id)).toBeVisible();
  await card(oil._id)
    .getByRole("button", { name: m.restoreSchedule, exact: true })
    .click();
  await expect(card(oil._id)).toHaveCount(0);
  await page.getByRole("button", { name: m.active, exact: true }).click();
  await expect(card(oil._id)).toBeVisible();

  await outsider.refresh();
  await assert.rejects(
    outsider.client.query(api.maintenance.listSchedules, {
      ...query,
      paginationOpts: { cursor: null, numItems: 20 },
    }),
    /AGENCY_ACCESS_DENIED/,
  );
  await employeePage.goto(url);
  await expect(employeePage.getByText(m.denied, { exact: true })).toBeVisible();
  await expect(
    employeePage.getByRole("button", { name: m.addSchedule, exact: true }),
  ).toHaveCount(0);
  await employee.refresh();
  await assert.rejects(
    employee.client.mutation(api.maintenance.saveSchedule, {
      ...query,
      expectedRevision: 0,
      service: "Forbidden",
      days: 1,
      requestKey: randomUUID(),
    }),
    /PERMISSION_DENIED/,
  );
  await owner.client.mutation(api.identity.updateMemberRole, {
    agencyId,
    userId: employee.profile.id,
    roleKey: "READ_ONLY",
  });
  try {
    await employeePage.goto(url);
    await expect(
      employeePage.getByRole("heading", { name: "Oil service", exact: true }),
    ).toBeVisible();
    for (const label of [
      m.addSchedule,
      m.editSchedule,
      m.archiveSchedule,
      m.restoreSchedule,
    ])
      await expect(
        employeePage.getByRole("button", { name: label, exact: true }),
      ).toHaveCount(0);
  } finally {
    await owner.client.mutation(api.identity.updateMemberRole, {
      agencyId,
      userId: employee.profile.id,
      roleKey: "EMPLOYEE",
    });
  }

  await page.goto(`${base}/app/${agencyId}/maintenance`);
  await expect(
    page.getByRole("link", { name: m.schedules, exact: true }),
  ).toHaveAttribute("href", `/app/${agencyId}/maintenance/schedules`);
  await page
    .getByRole("button", { name: m.createMaintenance, exact: true })
    .click();
  await page.getByLabel(m.vehicle, { exact: true }).click();
  await page.getByRole("option", { name: /Dacia Sandero/ }).click();
  await page
    .getByLabel(m.titleField, { exact: true })
    .fill("Scheduled oil service");
  await page
    .getByRole("checkbox", { name: "Oil service", exact: true })
    .check();
  await page
    .locator("form")
    .getByRole("button", { name: m.createMaintenance, exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/app/${agencyId}/maintenance/[a-z0-9]+$`),
  );
  const workId = new URL(page.url()).pathname.split("/").at(-1);
  let work = await owner.client.query(api.maintenance.get, {
    agencyId,
    id: workId,
  });
  assert.deepEqual(work.record.scheduleIds, [oil._id]);
  await page.goto(url);
  await card(oil._id)
    .getByRole("button", { name: m.archiveSchedule, exact: true })
    .click();
  await acceptDialog(m.archiveSchedule);
  await expect(card(oil._id).getByRole("alert")).toHaveText(m.scheduleHasWork);

  await page.goto(`${base}/app/${agencyId}/maintenance/${workId}`);
  await expect(
    page.getByRole("heading", { name: "Scheduled oil service", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: m.editCatalog, exact: true }).click();
  await page.locator("#maintenance-edit-vendor").click();
  await page
    .getByRole("option", { name: "Atlas Service", exact: true })
    .click();
  await page
    .locator("#maintenance-edit-findings")
    .fill("Use the approved workshop and original service schedule.");
  const timezone = (
    await owner.client.query(api.identity.getWorkspace, { agencyId })
  ).agency.timezone;
  const plannedStart = Date.now() + 14 * 24 * 3600_000;
  const localTime = (value) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(value)
      .replace(" ", "T");
  await page.locator("#maintenance-edit-start").fill(localTime(plannedStart));
  await page
    .locator("#maintenance-edit-end")
    .fill(localTime(plannedStart + 3600_000));
  await responsiveMatrix("maintenance-plan-edit");
  await page
    .locator("form")
    .getByRole("button", { name: m.saveDraft, exact: true })
    .click();
  await expect(page.locator("#maintenance-edit-title")).toHaveCount(0);
  work = await owner.client.query(api.maintenance.get, {
    agencyId,
    id: workId,
  });
  assert.equal(work.record.endAt - work.record.startAt, 3600_000);
  assert(work.record.vendorId);
  assert.deepEqual(work.record.scheduleIds, [oil._id]);
  const plannedAllocation = await owner.client.query(
    api.operations.allocationHistory,
    {
      agencyId,
      vehicleId,
      blocking: true,
      paginationOpts: { cursor: null, numItems: 25 },
    },
  );
  assert(
    plannedAllocation.page.some(
      (row) =>
        row.source.kind === "maintenance" &&
        row.source.id === workId &&
        row.startAt === work.record.startAt,
    ),
  );
  await page.getByRole("button", { name: m.start, exact: true }).click();
  await expect(page.getByLabel(m.findings, { exact: true })).toBeVisible();
  await page
    .getByLabel(m.findings, { exact: true })
    .fill("Oil and filter replaced.");
  await page.getByRole("checkbox", { name: m.ready, exact: true }).check();
  await page.getByRole("button", { name: m.complete, exact: true }).click();
  await expect(page.locator(".operations-heading p").last()).toContainText(
    m.completed,
  );
  work = await owner.client.query(api.maintenance.get, {
    agencyId,
    id: workId,
  });
  rows = await readSchedules();
  const serviced = rows.find((row) => row._id === oil._id);
  assert.equal(serviced.lastRecordId, workId);
  assert.equal(serviced.baselineAt, work.record.completedAt);
  assert.equal(serviced.baselineMeters, 12_000_000);
  assert.equal(serviced.nextDueMeters, 22_000_000);
  assert.equal(serviced.baselineValid, true);
  assert.equal(rows.find((row) => row._id === tyres._id).baselineValid, false);
  await page.goto(url);
  await expect(
    card(oil._id).getByText(m.upcoming, { exact: true }),
  ).toBeVisible();
  await expect(
    card(oil._id).getByRole("link", { name: new RegExp(m.lastService) }),
  ).toHaveAttribute("href", `/app/${agencyId}/maintenance/${workId}`);
  await responsiveMatrix("schedules");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 844, height: 390 });
  assert(
    await page
      .locator("#schedule-vehicle")
      .evaluate((element) => element.getBoundingClientRect().height >= 44),
    "Schedule vehicle picker touch target",
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "125%";
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Schedule landscape/text-size overflow",
  );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await card(oil._id)
    .getByRole("button", { name: m.editSchedule, exact: true })
    .click();
  await page
    .getByLabel(m.scheduleService, { exact: true })
    .fill("Discard this draft");
  await page.getByRole("button", { name: m.cancel, exact: true }).click();
  await acceptDialog(m.discardChanges);
  await expect(
    card(oil._id).getByRole("button", { name: m.editSchedule, exact: true }),
  ).toBeFocused();
  console.log(
    "PASS P5 schedules: revision-safe forms, unknown baselines, archive/restore, read-only permissions, linked maintenance completion and EN/FR/AR light/dark keyboard/responsive checks.",
  );
}
