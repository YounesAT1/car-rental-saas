import assert from "node:assert/strict";
import sharp from "sharp";
import { api } from "../convex/_generated/api.js";
import en from "../src/i18n/messages/en.json" with { type: "json" };
import fr from "../src/i18n/messages/fr.json" with { type: "json" };
import ar from "../src/i18n/messages/ar.json" with { type: "json" };
import { smokePhase5Domain } from "./smoke-phase5-domain.mjs";
import { smokePhase5Schedules } from "./smoke-phase5-schedules.mjs";
import { smokePhase5WorkspaceForms } from "./smoke-phase5-workspace-forms.mjs";

export async function smokePhase5({
  page,
  employeePage,
  owner,
  employee,
  outsider,
  agencyId,
  vehicleId,
  base,
  artifactPath,
  expect,
}) {
  const m = en.common.operations;
  const dictionaries = [
    ["en", en, "English"],
    ["fr", fr, "Français"],
    ["ar", ar, "العربية"],
  ];

  async function responsiveMatrix(name) {
    for (const [locale, , language] of dictionaries) {
      await page.locator(".language-trigger").click();
      await page
        .getByRole("menuitemradio", { name: language, exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      for (const theme of ["light", "dark"]) {
        const dark = await page
          .locator("html")
          .evaluate((element) => element.classList.contains("dark"));
        if (dark !== (theme === "dark"))
          await page.locator(".floating-theme-toggle").click();
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          const overflow = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".operations-page *"))
              .filter(
                (element) =>
                  element.getBoundingClientRect().right > innerWidth + 1 ||
                  element.getBoundingClientRect().left < -1,
              )
              .slice(0, 8)
              .map((element) => ({
                tag: element.tagName,
                className: element.className,
                text: element.textContent?.slice(0, 90),
                width: element.getBoundingClientRect().width,
              })),
          );
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Phase 5 ${name} ${locale} ${theme} overflow at ${width}: ${JSON.stringify(overflow)}`,
          );
        }
        await page.setViewportSize({
          width: locale === "en" ? 1440 : 390,
          height: 1000,
        });
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await page.screenshot({
          path: `${artifactPath}/phase5-${name}-${locale}-${theme}.png`,
          fullPage: true,
        });
      }
    }
    await page.locator(".language-trigger").click();
    await page
      .getByRole("menuitemradio", { name: "English", exact: true })
      .click();
    if (
      await page
        .locator("html")
        .evaluate((element) => element.classList.contains("dark"))
    )
      await page.locator(".floating-theme-toggle").click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  await owner.refresh();
  await page.goto(`${base}/app/${agencyId}/settings/operations`);
  await expect(
    page.getByRole("heading", { name: m.settings, exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: m.addDocumentType, exact: true })
    .click();
  await page.getByLabel(en.common.operations.code, { exact: true }).fill("REG");
  await page
    .getByLabel(en.common.operations.labelEn, { exact: true })
    .fill("Registration");
  await page
    .getByLabel(en.common.operations.labelFr, { exact: true })
    .fill("Immatriculation");
  await page
    .getByLabel(en.common.operations.labelAr, { exact: true })
    .fill("التسجيل");
  await page
    .locator("form")
    .getByRole("button", { name: m.addDocumentType, exact: true })
    .click();
  await expect(page.getByText("Registration", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: m.addTemplate, exact: true }).click();
  await page.locator("#inspection-template-code").fill("DAILY");
  const templateLabels = [
    [m.labelEn, "Daily readiness"],
    [m.labelFr, "Préparation quotidienne"],
    [m.labelAr, "الجاهزية اليومية"],
  ];
  for (const [index, [, value]] of templateLabels.entries())
    await page
      .locator(`#inspection-template-${["en", "fr", "ar"][index]}`)
      .fill(value);
  await page
    .locator("form")
    .getByRole("button", { name: m.addTemplate, exact: true })
    .click();
  await expect(
    page.getByText("Daily readiness", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: m.addVendor, exact: true }).click();
  await page.getByLabel(m.name, { exact: true }).fill("Atlas Service");
  await page.getByLabel(m.phone, { exact: true }).fill("+212500000000");
  await page.getByLabel(m.email, { exact: true }).fill("service@example.com");
  await page.getByLabel(m.address, { exact: true }).fill("Casablanca");
  await page
    .locator("form")
    .getByRole("button", { name: m.addVendor, exact: true })
    .click();
  await expect(page.getByText("Atlas Service", { exact: true })).toBeVisible();
  await responsiveMatrix("settings");

  await page.goto(`${base}/app/${agencyId}/fleet/${vehicleId}/operations`);
  await expect(
    page.getByRole("heading", { name: m.vehicleOperations, exact: true }),
  ).toBeVisible();
  await page.getByLabel(m.value, { exact: true }).fill("12000");
  await page.getByRole("button", { name: m.addMileage, exact: true }).click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();

  const evidence = await sharp({
    create: {
      width: 220,
      height: 140,
      channels: 3,
      background: { r: 69, g: 81, b: 145 },
    },
  })
    .png()
    .toBuffer();
  await page.getByLabel(m.documentType, { exact: true }).click();
  await page.getByRole("option", { name: "Registration", exact: true }).click();
  await page.getByLabel(m.documentNumber, { exact: true }).fill("REG-001");
  await page.getByLabel(m.issuer, { exact: true }).fill("Agency records");
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-invalid"),
  });
  await page.getByRole("button", { name: m.upload, exact: true }).click();
  await expect(
    page.locator(".operations-document-form .operations-upload-status"),
  ).toHaveText(m.uploadFailed, { timeout: 45000 });
  await expect(page.getByLabel(m.documentNumber, { exact: true })).toHaveValue(
    "REG-001",
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "registration.png",
    mimeType: "image/png",
    buffer: evidence,
  });
  await page.getByRole("button", { name: m.upload, exact: true }).click();
  await expect(
    page.locator(".operations-document-form .operations-upload-status"),
  ).toHaveText(m.saved, {
    timeout: 45000,
  });
  const compliance = await owner.client.query(api.vehicleDocuments.compliance, {
    agencyId,
    vehicleId,
  });
  const document = compliance.find((item) => item.type.code === "REG");
  assert.equal(document?.state, "valid");
  assert(document.document?.fileId, "Phase 5 upload did not publish evidence");
  await responsiveMatrix("vehicle-operations");
  await smokePhase5Schedules({
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
  });

  await page.goto(`${base}/app/${agencyId}/inspections`);
  await page
    .getByRole("button", { name: m.createInspection, exact: true })
    .click();
  await page.getByLabel(m.vehicle, { exact: true }).click();
  await page.getByRole("option", { name: /Dacia Sandero/ }).click();
  await page.getByLabel(m.template, { exact: true }).click();
  await page
    .getByRole("option", { name: "Daily readiness", exact: true })
    .click();
  await page
    .locator("form")
    .getByRole("button", { name: m.createInspection, exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/app/${agencyId}/inspections/[a-z0-9]+$`),
  );
  await expect(
    page.getByRole("heading", { name: "Daily readiness", exact: true }),
  ).toBeVisible();
  const checklistRows = page.locator(".operations-checklist-row");
  await expect(checklistRows).toHaveCount(6);
  const checklistCount = await checklistRows.count();
  for (let index = 0; index < checklistCount; index++) {
    const combobox = checklistRows.nth(index).getByRole("combobox");
    await combobox.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(
      page.getByRole("option", { name: m.unchecked, exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("option", { name: m.pass, exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(combobox).toContainText(m.pass);
  }
  await expect(checklistRows.getByRole("combobox")).toHaveText(
    Array.from({ length: checklistCount }, () => m.pass),
  );
  await page
    .getByRole("checkbox", { name: m.acknowledgment, exact: true })
    .check();
  await page.getByRole("button", { name: m.saveDraft, exact: true }).click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  const inspectionId = page.url().split("/").at(-1);
  const persistedInspection = await owner.client.query(api.inspections.get, {
    agencyId,
    id: inspectionId,
  });
  assert(persistedInspection, "Phase 5 inspection disappeared after save");
  assert.deepEqual(
    persistedInspection.items.map((item) => item.result),
    Array.from({ length: checklistCount }, () => "pass"),
    "Phase 5 checklist results were not persisted",
  );
  assert.equal(
    persistedInspection.acknowledgment,
    true,
    "Phase 5 acknowledgment was not persisted",
  );
  await page
    .getByLabel(m.findings, { exact: true })
    .fill("Current readiness checked.");
  await expect(
    page.getByRole("button", { name: m.complete, exact: true }),
  ).toBeDisabled();
  await responsiveMatrix("inspection-draft");
  await expect(page.getByLabel(m.findings, { exact: true })).toHaveValue(
    "Current readiness checked.",
  );
  await page.getByRole("button", { name: m.saveDraft, exact: true }).click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  assert.equal(
    (
      await owner.client.query(api.inspections.get, {
        agencyId,
        id: inspectionId,
      })
    ).notes,
    "Current readiness checked.",
  );
  await page.getByRole("button", { name: m.complete, exact: true }).click();
  await expect(page.locator(".operations-heading p").last()).toContainText(
    m.completed,
  );
  assert.equal(
    (
      await owner.client.query(api.inspections.get, {
        agencyId,
        id: inspectionId,
      })
    ).status,
    "completed",
  );

  await page.getByRole("button", { name: m.reported, exact: true }).click();
  await page.getByLabel(m.reason, { exact: true }).fill("Front bumper");
  await page
    .getByLabel(m.descriptionField, { exact: true })
    .fill("Small scuff");
  await page
    .locator("form")
    .getByRole("button", { name: m.reported, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Front bumper", exact: true }),
  ).toBeVisible();
  const damageId = page.url().split("/").at(-1);

  await page.goto(`${base}/app/${agencyId}/tasks`);
  await page.getByRole("button", { name: m.createTask, exact: true }).click();
  await page
    .getByLabel(m.titleField, { exact: true })
    .fill("Review operational evidence");
  await page
    .getByLabel(m.descriptionField, { exact: true })
    .fill("Confirm the new document and inspection history.");
  await page
    .locator("form")
    .getByRole("button", { name: m.createTask, exact: true })
    .click();
  await expect(
    page.getByText("Review operational evidence", { exact: true }),
  ).toBeVisible();

  await employeePage.goto(`${base}/app/${agencyId}/tasks`);
  await expect(
    employeePage.getByRole("group", { name: m.tasks, exact: true }),
  ).toBeVisible();
  await expect(
    employeePage.getByRole("button", { name: m.createTask, exact: true }),
  ).toHaveCount(0);
  await employeePage.goto(`${base}/app/${agencyId}/inspections`);
  await expect(
    employeePage.getByRole("heading", { name: m.title, exact: true }),
  ).toBeVisible();
  await expect(
    employeePage.getByRole("button", { name: m.createInspection, exact: true }),
  ).toHaveCount(0);
  await responsiveMatrix("operations");
  const domain = await smokePhase5Domain({
    page,
    employeePage,
    owner,
    employee,
    outsider,
    agencyId,
    vehicleId,
    expect,
  });
  await page.goto(
    `${base}/app/${agencyId}/maintenance/${domain.maintenanceId}`,
  );
  await expect(
    page.getByRole("heading", {
      name: "Live maintenance acceptance",
      exact: true,
    }),
  ).toBeVisible();
  await responsiveMatrix("maintenance-detail");
  await smokePhase5WorkspaceForms({
    page,
    employeePage,
    owner,
    employee,
    outsider,
    agencyId,
    vehicleId,
    inspectionId,
    damageId,
    maintenanceId: domain.maintenanceId,
    base,
    expect,
    responsiveMatrix,
  });
  await page.goto(`${base}/app/${agencyId}/operations`);
  await expect(
    page.getByRole("heading", { name: m.title, exact: true }),
  ).toBeVisible();
  await responsiveMatrix("overview");
  await employeePage.goto(`${base}/app/${agencyId}`);
  await expect(
    employeePage.getByText("EMPLOYEE", { exact: true }),
  ).toBeVisible();
  await page.goto(`${base}/app/${agencyId}`);
  console.log(
    "PASS P5: operational setup, agency queues, mileage, private evidence, inspection completion, damage capture, task permissions and EN/FR/AR light/dark responsive checks.",
  );
}
