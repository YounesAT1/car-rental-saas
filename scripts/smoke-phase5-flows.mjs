import assert from "node:assert/strict";
import sharp from "sharp";
import { api } from "../convex/_generated/api.js";
import en from "../src/i18n/messages/en.json" with { type: "json" };
import fr from "../src/i18n/messages/fr.json" with { type: "json" };
import ar from "../src/i18n/messages/ar.json" with { type: "json" };

export async function smokePhase5({
  page,
  employeePage,
  owner,
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
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Phase 5 ${name} ${locale} ${theme} overflow at ${width}`,
          );
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
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
  await page
    .getByLabel(en.common.operations.code, { exact: true })
    .fill("DAILY");
  const templateLabels = [
    [m.labelEn, "Daily readiness"],
    [m.labelFr, "Préparation quotidienne"],
    [m.labelAr, "الجاهزية اليومية"],
  ];
  for (const [label, value] of templateLabels)
    await page.getByLabel(label, { exact: true }).fill(value);
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
    name: "registration.png",
    mimeType: "image/png",
    buffer: evidence,
  });
  await page.getByRole("button", { name: m.upload, exact: true }).click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible({
    timeout: 45000,
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
  await expect(
    page.getByRole("heading", { name: "Daily readiness", exact: true }),
  ).toBeVisible();
  const checklistRows = page.locator(".operations-checklist-row");
  for (let index = 0; index < (await checklistRows.count()); index++) {
    const combobox = checklistRows.nth(index).getByRole("combobox");
    await combobox.click();
    await combobox.press("ArrowDown");
    await combobox.press("Enter");
    await expect(combobox).toContainText(m.pass);
  }
  await expect(checklistRows.getByRole("combobox")).toHaveText(
    Array.from({ length: await checklistRows.count() }, () => m.pass),
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
    Array.from({ length: await checklistRows.count() }, () => "pass"),
    "Phase 5 checklist results were not persisted",
  );
  assert.equal(
    persistedInspection.acknowledgment,
    true,
    "Phase 5 acknowledgment was not persisted",
  );
  await page.getByRole("button", { name: m.complete, exact: true }).click();
  await expect(page.getByText(m.completed, { exact: true })).toBeVisible();

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
    employeePage.getByRole("heading", { name: m.tasks, exact: true }),
  ).toBeVisible();
  await expect(
    employeePage.getByRole("button", { name: m.createTask, exact: true }),
  ).toHaveCount(0);
  await employeePage.goto(`${base}/app/${agencyId}/inspections`);
  await expect(
    employeePage.getByRole("button", { name: m.createInspection, exact: true }),
  ).toHaveCount(0);
  await responsiveMatrix("operations");
  console.log(
    "PASS P5: operational setup, agency queues, mileage, private evidence, inspection completion, damage capture, task permissions and EN/FR/AR light/dark responsive checks.",
  );
}
