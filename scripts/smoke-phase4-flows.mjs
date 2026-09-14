import assert from "node:assert/strict";
import sharp from "sharp";
import { api } from "../convex/_generated/api.js";
import en from "../src/i18n/messages/en.json" with { type: "json" };
import fr from "../src/i18n/messages/fr.json" with { type: "json" };
import ar from "../src/i18n/messages/ar.json" with { type: "json" };

export async function smokePhase4({
  page,
  employeePage,
  owner,
  employee,
  outsider,
  agencyId,
  base,
  artifactPath,
  expect,
}) {
  const m = en.common.fleet;
  const root = `${base}/app/${agencyId}/fleet`;
  await owner.refresh();
  await employee.refresh();
  await outsider.refresh();
  await page.goto(root);
  await expect(
    page.getByRole("heading", { name: m.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: m.catalogs, exact: true }).click();
  await page.getByRole("button", { name: m.addCategory, exact: true }).click();
  // Cancelling keeps the draft; confirming an intercepted link navigates once.
  await page.getByLabel(m.code, { exact: true }).fill("DISCARD");
  const vehiclesLink = page.getByRole("link", {
    name: m.vehicles,
    exact: true,
  });
  await vehiclesLink.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(
    page
      .getByRole("alertdialog")
      .getByRole("button", { name: m.cancel, exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(vehiclesLink).toBeFocused();
  await expect(page.getByLabel(m.code, { exact: true })).toHaveValue("DISCARD");
  await vehiclesLink.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: en.common.confirmation.discard, exact: true })
    .click();
  await expect(page.getByLabel(m.search, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: m.catalogs, exact: true }).click();
  await page.getByRole("button", { name: m.addCategory, exact: true }).click();
  const publicCheckbox = page.getByRole("checkbox", {
    name: m.publicLabel,
    exact: true,
  });
  await publicCheckbox.uncheck();
  await expect(publicCheckbox).not.toBeChecked();
  await publicCheckbox.check();
  await page.getByLabel(m.code, { exact: true }).fill("ECO");
  await page.getByLabel(m.labelEn, { exact: true }).fill("Economy");
  await page.getByLabel(m.labelFr, { exact: true }).fill("Économique");
  await page.getByLabel(m.labelAr, { exact: true }).fill("اقتصادية");
  await page.getByRole("button", { name: m.save, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Economy", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: m.addFeature, exact: true }).click();
  await page.getByLabel(m.code, { exact: true }).fill("AC");
  await page.getByLabel(m.labelEn, { exact: true }).fill("Air conditioning");
  await page.getByRole("button", { name: m.save, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Air conditioning", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: m.vehicles, exact: true }).click();
  await page.getByRole("link", { name: m.add, exact: true }).click();
  await page.getByLabel(m.fleetNumber, { exact: true }).fill("AT-001");
  await page.getByLabel(m.plate, { exact: true }).fill("12345-A-6");
  await page.getByLabel(m.make, { exact: true }).fill("Dacia");
  await page.getByLabel(m.model, { exact: true }).fill("Sandero");
  await page.getByLabel(m.color, { exact: true }).fill("Blue");
  await page.getByLabel(m.notes, { exact: true }).fill("Private internal note");
  await page.getByLabel("Air conditioning", { exact: true }).check();
  // Preserve a draft while changing language and validate both themes at all widths.
  async function matrix(name, field, value) {
    for (const [locale, dictionary, language] of [
      ["en", en, "English"],
      ["fr", fr, "Français"],
      ["ar", ar, "العربية"],
    ]) {
      await page.locator(".language-trigger").click();
      await page
        .getByRole("menuitemradio", { name: language, exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      if (field)
        await expect(
          page.getByLabel(dictionary.common.fleet[field], { exact: true }),
        ).toHaveValue(value);
      else
        await expect(
          page.getByRole("heading", {
            name: dictionary.common.fleet.title,
            exact: true,
          }),
        ).toBeVisible();
      for (const theme of ["light", "dark"]) {
        const dark = await page
          .locator("html")
          .evaluate((el) => el.classList.contains("dark"));
        if (dark !== (theme === "dark"))
          await page.locator(".floating-theme-toggle").click();
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `Fleet ${name} ${locale} ${theme} overflow at ${width}`,
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
          path: `${artifactPath}/phase4-${name}-${locale}-${theme}.png`,
          fullPage: true,
        });
        if (name === "list") {
          const filter = page.getByRole("combobox", {
            name: dictionary.common.fleet.categoryId,
            exact: true,
          });
          await filter.focus();
          await page.keyboard.press("Enter");
          await expect(page.getByRole("listbox")).toBeVisible();
          await page.screenshot({
            path: `${artifactPath}/shadcn-select-${locale}-${theme}.png`,
          });
          await page.keyboard.press("Escape");
          await expect(filter).toBeFocused();
        }
      }
    }
    await page.locator(".language-trigger").click();
    await page
      .getByRole("menuitemradio", { name: "English", exact: true })
      .click();
    if (
      await page.locator("html").evaluate((el) => el.classList.contains("dark"))
    )
      await page.locator(".floating-theme-toggle").click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await matrix("editor", "make", "Dacia");
  await page.getByLabel(m.make, { exact: true }).focus();
  await page.keyboard.press("Tab");
  assert(
    await page.evaluate(
      () => document.activeElement instanceof HTMLInputElement,
    ),
  );
  await page.getByRole("button", { name: m.add, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dacia Sandero", exact: true }),
  ).toBeVisible();
  const vehicleId = new URL(page.url()).pathname.split("/").at(-1);
  let record = await owner.client.query(api.fleet.get, { agencyId, vehicleId });
  assert.equal(record.publicVisible, false);
  await assert.rejects(
    outsider.client.query(api.fleet.get, { agencyId, vehicleId }),
    /AGENCY_ACCESS_DENIED/,
  );
  await assert.rejects(
    employee.client.mutation(api.fleet.setVisibility, {
      agencyId,
      vehicleId,
      expectedRevision: record.revision,
      publicVisible: true,
    }),
    /PERMISSION_DENIED/,
  );
  await page.getByLabel(m.costAmount, { exact: true }).fill("125000.50");
  await page.getByRole("button", { name: m.saveCost, exact: true }).click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  record = await owner.client.query(api.fleet.get, { agencyId, vehicleId });
  assert.equal(record.acquisitionCost.amountMinor, 12500050);
  // Exercise the real server decoder, MIME/hash finalizer and URL delivery.
  const png = await sharp({
    create: {
      width: 800,
      height: 500,
      channels: 3,
      background: { r: 68, g: 82, b: 140 },
    },
  })
    .png()
    .withMetadata()
    .toBuffer();
  await page.getByLabel(m.altEn, { exact: true }).fill("Vehicle photo test");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "vehicle.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("img", { name: "Vehicle photo test", exact: true }),
  ).toBeVisible({ timeout: 45000 });
  const photos = await owner.client.query(api.fleetPhotos.list, {
    agencyId,
    vehicleId,
  });
  assert.equal(photos.length, 1);
  const response = await fetch(photos[0].url);
  assert.equal(response.status, 200);
  assert(response.headers.get("content-type").includes("image/webp"));
  const metadata = await sharp(
    Buffer.from(await response.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.exif, undefined);
  const secondIntent = await owner.client.mutation(api.fleetPhotos.begin, {
    agencyId,
    vehicleId,
  });
  await owner.client.action(api.photoUpload.upload, {
    intentId: secondIntent,
    bytes: Uint8Array.from(png).buffer,
    alt: { en: "Second vehicle photo", fr: "", ar: "" },
  });
  const secondFigure = page.locator(".fleet-gallery figure").filter({
    has: page.getByRole("img", { name: "Second vehicle photo", exact: true }),
  });
  await secondFigure
    .getByRole("button", { name: m.makePrimary, exact: true })
    .click();
  await expect(
    page
      .locator(".fleet-gallery figure")
      .first()
      .getByRole("img", { name: "Second vehicle photo", exact: true }),
  ).toBeVisible();
  await secondFigure
    .getByRole("button", { name: m.editAlt, exact: true })
    .click();
  await page.getByLabel(m.altEn, { exact: true }).fill("Retained photo draft");
  record = await owner.client.query(api.fleet.get, { agencyId, vehicleId });
  await owner.client.mutation(api.fleet.setVisibility, {
    agencyId,
    vehicleId,
    expectedRevision: record.revision,
    publicVisible: false,
  });
  await page.getByRole("button", { name: m.save, exact: true }).click();
  await expect(page.getByText(m.conflict, { exact: true })).toBeVisible();
  await expect(page.getByLabel(m.altEn, { exact: true })).toHaveValue(
    "Retained photo draft",
  );
  await page.getByRole("button", { name: m.reload, exact: true }).click();
  await expect(page.getByLabel(m.altEn, { exact: true })).toHaveValue(
    "Second vehicle photo",
  );
  await page.getByRole("button", { name: m.cancel, exact: true }).click();
  await secondFigure
    .getByRole("button", { name: m.remove, exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: m.cancel, exact: true })
    .click();
  await expect(page.locator(".fleet-gallery figure")).toHaveCount(2);
  await secondFigure
    .getByRole("button", { name: m.remove, exact: true })
    .click();
  await page.screenshot({ path: `${artifactPath}/shadcn-confirmation.png` });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: m.remove, exact: true })
    .click();
  await expect(page.locator(".fleet-gallery figure")).toHaveCount(1);
  const badIntent = await owner.client.mutation(api.fleetPhotos.begin, {
    agencyId,
    vehicleId,
  });
  await assert.rejects(
    owner.client.action(api.photoUpload.upload, {
      intentId: badIntent,
      bytes: new TextEncoder().encode("<svg/>").buffer,
      alt: { en: "Bad", fr: "", ar: "" },
    }),
    /UPLOAD_INVALID/,
  );
  await assert.rejects(
    owner.client.action(api.photoUpload.upload, {
      intentId: badIntent,
      bytes: Uint8Array.from(png).buffer,
      alt: { en: "Replay", fr: "", ar: "" },
    }),
    /UPLOAD_INVALID/,
  );
  assert.equal(
    (await owner.client.query(api.fleetPhotos.list, { agencyId, vehicleId }))
      .length,
    1,
  );
  await page.getByRole("button", { name: m.publish, exact: true }).click();
  await expect(
    page.getByRole("button", { name: m.hide, exact: true }),
  ).toBeVisible();
  const publicRecord = await outsider.client.query(api.fleet.publicVehicle, {
    agencyId,
    vehicleId,
  });
  assert.equal(publicRecord.make, "Dacia");
  for (const key of ["plate", "vin", "notes", "acquisitionCost", "branchId"])
    assert(!(key in publicRecord));
  await matrix("detail");
  await page.getByRole("link", { name: m.edit, exact: true }).click();
  await page.getByLabel(m.color, { exact: true }).fill("White");
  record = await owner.client.query(api.fleet.get, { agencyId, vehicleId });
  await owner.client.mutation(api.fleet.setVisibility, {
    agencyId,
    vehicleId,
    expectedRevision: record.revision,
    publicVisible: false,
  });
  await page.getByRole("button", { name: m.save, exact: true }).click();
  await expect(page.getByText(m.conflict, { exact: true })).toBeVisible();
  await expect(page.getByLabel(m.color, { exact: true })).toHaveValue("White");
  await page.getByRole("button", { name: m.reload, exact: true }).click();
  await expect(page.getByLabel(m.color, { exact: true })).toHaveValue("Blue");
  await page.getByRole("button", { name: m.cancel, exact: true }).click();
  await page.getByRole("button", { name: m.archive, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: m.archive, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: m.restore, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: m.restore, exact: true }).click();
  await expect(
    page.getByRole("link", { name: m.edit, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: m.back, exact: true }).click();
  const categoryFilter = page.getByRole("combobox", {
    name: m.categoryId,
    exact: true,
  });
  await categoryFilter.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Economy", exact: true }).click();
  await expect(categoryFilter).toHaveText("Economy");
  const branchFilter = page.getByRole("combobox", {
    name: m.branchId,
    exact: true,
  });
  await branchFilter.click();
  await page
    .getByRole("option", { name: "Casablanca Airport Desk", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /Dacia Sandero/ }).first(),
  ).toBeVisible();
  await categoryFilter.click();
  await page
    .getByRole("option", { name: m.allCategories, exact: true })
    .click();
  await branchFilter.click();
  await page.getByRole("option", { name: m.allBranches, exact: true }).click();
  await page.getByLabel(m.search, { exact: true }).fill("12345 a 6");
  await page.getByLabel(m.exact, { exact: true }).check();
  await expect(
    page.getByRole("link", { name: /Dacia Sandero/ }).first(),
  ).toBeVisible();
  await matrix("list");
  await employeePage.goto(`${root}/${vehicleId}`);
  await expect(
    employeePage.getByRole("heading", { name: "Dacia Sandero", exact: true }),
  ).toBeVisible();
  await expect(
    employeePage.getByRole("link", { name: m.edit, exact: true }),
  ).toHaveCount(0);
  await expect(
    employeePage.getByRole("heading", { name: m.cost, exact: true }),
  ).toHaveCount(0);
  await employeePage.goto(`${base}/app/${agencyId}`);
  await page.goto(`${base}/app/${agencyId}`);
  console.log(
    "PASS P4: catalogs, vehicle create/edit, tenant and role isolation, exact search, cost privacy, stale drafts, archive/restore, real photo processing and rejected uploads; EN/FR/AR, light/dark and four responsive widths.",
  );
  return { vehicleId };
}
