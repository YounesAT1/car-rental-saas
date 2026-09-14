import assert from "node:assert/strict";
import { api } from "../convex/_generated/api.js";
import en from "../src/i18n/messages/en.json" with { type: "json" };
import fr from "../src/i18n/messages/fr.json" with { type: "json" };
import ar from "../src/i18n/messages/ar.json" with { type: "json" };

export async function smokePhase3({
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
  const m = en.common.settings;
  const settingsUrl = `${base}/app/${agencyId}/settings`;
  async function checkEditorLayouts(section, fieldKey, expectedValue) {
    for (const [locale, dictionary, language] of [
      ["en", en, "English"],
      ["fr", fr, "Français"],
      ["ar", ar, "العربية"],
    ]) {
      await page.locator(".language-trigger").click();
      await page
        .getByRole("menuitemradio", { name: language, exact: true })
        .click();
      await expect(
        page.getByLabel(dictionary.common.settings[fieldKey], { exact: true }),
      ).toHaveValue(expectedValue);
      for (const theme of ["light", "dark"]) {
        if (theme === "dark")
          await page.locator(".floating-theme-toggle").click();
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${section} ${locale} ${theme} overflow at ${width}`,
          );
        }
        await page.setViewportSize({
          width: locale === "en" ? 1440 : 320,
          height: 1000,
        });
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await page.screenshot({
          path: `${artifactPath}/phase3-${section}-${locale}-${theme}.png`,
          fullPage: true,
        });
      }
      await page.locator(".floating-theme-toggle").click();
    }
    await page.locator(".language-trigger").click();
    await page
      .getByRole("menuitemradio", { name: "English", exact: true })
      .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await owner.refresh();
  await employee.refresh();
  await outsider.refresh();
  await page.goto(settingsUrl);
  await expect(page.getByLabel(m.name, { exact: true })).toHaveValue(
    "Phase 2 Browser",
  );
  await page
    .getByLabel(m.legalName, { exact: true })
    .fill("Atlas Mobility SARL");
  await page.getByLabel(m.email, { exact: true }).fill("hello@example.com");
  await page.getByLabel(m.city, { exact: true }).fill("Casablanca");
  await page.getByRole("button", { name: m.save, exact: true }).click();
  await expect(page.getByText(m.saved, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(m.legalName, { exact: true })).toHaveValue(
    "Atlas Mobility SARL",
  );
  const business = await owner.client.query(api.agencySettings.getBusiness, {
    agencyId,
  });
  assert.equal(business.currency, "MAD");
  assert.equal(business.country, "MA");
  await page.getByRole("combobox", { name: m.currency, exact: true }).click();
  await page.getByRole("option", { name: "EUR", exact: true }).click();
  await page.getByRole("combobox", { name: m.currency, exact: true }).click();
  await page.getByRole("option", { name: "MAD", exact: true }).click();
  const businessValues = Object.fromEntries(
    Object.entries(business).filter(
      ([key]) => !["id", "slug", "revision"].includes(key),
    ),
  );
  await assert.rejects(
    outsider.client.query(api.agencySettings.getBusiness, { agencyId }),
    /AGENCY_ACCESS_DENIED/,
  );
  await assert.rejects(
    employee.client.mutation(api.agencySettings.saveBusiness, {
      agencyId,
      expectedRevision: business.revision,
      values: businessValues,
    }),
    /PERMISSION_DENIED/,
  );

  // A real second writer must produce a recoverable conflict without deleting a draft.
  await page
    .getByLabel(m.legalName, { exact: true })
    .fill("My unsaved business name");
  await owner.client.mutation(api.agencySettings.saveBusiness, {
    agencyId,
    expectedRevision: business.revision,
    values: { ...businessValues, legalName: "Another administrator's update" },
  });
  await page.getByRole("button", { name: m.save, exact: true }).click();
  await expect(
    page.getByText(m.errors.conflict, { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(m.legalName, { exact: true })).toHaveValue(
    "My unsaved business name",
  );
  await page.getByRole("button", { name: m.reload, exact: true }).click();
  await expect(page.getByLabel(m.legalName, { exact: true })).toHaveValue(
    "Another administrator's update",
  );
  console.log(
    "PASS P3: business persistence, regional defaults, denied writes and concurrent edit recovery.",
  );

  for (const [locale, dictionary] of [
    ["en", en],
    ["fr", fr],
    ["ar", ar],
  ]) {
    const messages = dictionary.common.settings;
    if (locale !== "en") {
      await page.locator(".language-trigger").click();
      await page
        .getByRole("menuitemradio", {
          name: locale === "fr" ? "Français" : "العربية",
          exact: true,
        })
        .click();
    }
    await expect(page.getByLabel(messages.name, { exact: true })).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Business ${locale} overflow at ${width}`,
      );
    }
    await page.setViewportSize({
      width: locale === "en" ? 1440 : 390,
      height: 1000,
    });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `${artifactPath}/phase3-business-${locale}-light.png`,
      fullPage: true,
    });
    await page.locator(".floating-theme-toggle").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.screenshot({
      path: `${artifactPath}/phase3-business-${locale}-dark.png`,
      fullPage: true,
    });
    await page.locator(".floating-theme-toggle").click();
  }
  await page.locator(".language-trigger").click();
  await page
    .getByRole("menuitemradio", { name: "English", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".settings-navigation")
    .getByRole("link", { name: m.branches, exact: true })
    .click();
  await page
    .getByRole("button", { name: m.addBranch, exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: m.addBranch, exact: true }).click();
  await expect(page.getByText(m.validation.required).first()).toBeVisible();
  await page
    .getByLabel(m.branchName, { exact: true })
    .fill("Casablanca Airport");
  await page.getByLabel(m.code, { exact: true }).fill(" cmn-01 ");
  await page
    .getByLabel(m.address, { exact: true })
    .fill("Terminal 1, Mohammed V Airport");
  await page.getByLabel(m.city, { exact: true }).fill("Casablanca");
  await page.getByLabel("Closes · Monday 1", { exact: true }).fill("08:00");
  await page.getByRole("button", { name: m.addBranch, exact: true }).click();
  await expect(page.getByText(m.validation.hours).first()).toBeVisible();
  await page.getByLabel("Closes · Monday 1", { exact: true }).fill("12:00");
  await page
    .getByRole("button", { name: "Add hours · Monday", exact: true })
    .click();
  await page.getByLabel("Opens · Monday 2", { exact: true }).fill("14:00");
  await page.getByLabel("Closes · Monday 2", { exact: true }).fill("18:00");
  await page.getByRole("button", { name: m.addClosure, exact: true }).click();
  await page.getByLabel("Date 1", { exact: true }).fill("2026-12-25");
  await page
    .getByLabel(`${m.reason} 1`, { exact: true })
    .fill("Annual closure");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Branch editor overflow at ${width}`,
    );
  }
  await page.screenshot({
    path: `${artifactPath}/phase3-branch-editor-desktop.png`,
    fullPage: true,
  });
  await checkEditorLayouts("branch-editor", "branchName", "Casablanca Airport");
  await page.getByRole("button", { name: m.addBranch, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Casablanca Airport", exact: true }),
  ).toBeVisible();
  await owner.refresh();
  await outsider.refresh();
  const branch = (
    await owner.client.query(api.branches.list, {
      agencyId,
      status: "active",
      paginationOpts: { numItems: 10, cursor: null },
    })
  ).page[0];
  assert.equal(branch.code, "CMN-01");
  assert.equal(branch.closures[0].date, "2026-12-25");
  assert.equal(branch.hours[1].intervals.length, 2);
  await assert.rejects(
    outsider.client.query(api.branches.get, { agencyId, branchId: branch.id }),
    /AGENCY_ACCESS_DENIED/,
  );
  await page.getByRole("button", { name: m.edit, exact: true }).click();
  await page
    .getByLabel(m.branchName, { exact: true })
    .fill("Casablanca Airport Desk");
  await page.getByRole("button", { name: m.save, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Casablanca Airport Desk", exact: true }),
  ).toBeVisible();
  const hoursToggle = page.getByRole("button", { name: m.hours, exact: true });
  await hoursToggle.focus();
  await page.keyboard.press("Enter");
  await expect(hoursToggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Space");
  await expect(hoursToggle).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: m.archive, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: m.archive, exact: true })
    .click();
  await expect(page.getByText(m.noBranches)).toBeVisible();
  await page.getByRole("button", { name: m.archived, exact: true }).click();
  await page.getByRole("button", { name: m.restore, exact: true }).click();
  await page.getByRole("button", { name: m.active, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Casablanca Airport Desk", exact: true }),
  ).toBeVisible();
  console.log(
    "PASS P3: branch create/edit, normalized code, split hours, closure, archive/restore and responsive editor.",
  );

  await page
    .locator(".settings-navigation")
    .getByRole("link", { name: m.policies, exact: true })
    .click();
  await page
    .getByRole("button", { name: m.newVersion, exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: m.publish, exact: true }).click();
  await expect(
    page.getByText(m.validation.terms, { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(m.termsEnglish, { exact: true })
    .fill(
      "Return with a full tank. Free cancellation with 48 hours notice. Deposit returned following inspection. Unlimited mileage.",
    );
  await page
    .getByLabel(m.termsFrench, { exact: true })
    .fill(
      "Retour avec le plein. Annulation gratuite 48 heures avant. Kilométrage illimité.",
    );
  await page
    .getByLabel(m.termsArabic, { exact: true })
    .fill(
      "أعد السيارة بخزان ممتلئ. إلغاء مجاني قبل 48 ساعة. مسافة غير محدودة.",
    );
  await page.getByLabel("Deposit (MAD)", { exact: true }).fill("2500.10");
  await checkEditorLayouts("policy-editor", "minimumDriverAge", "21");
  await page.getByRole("button", { name: m.publish, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Version 1", exact: true }),
  ).toBeVisible();
  await owner.refresh();
  const policy1 = (
    await owner.client.query(api.agencySettings.getCurrentPolicy, { agencyId })
  ).policy;
  assert.equal(policy1.depositAmountMinor, 250010);
  assert.equal(policy1.currency, "MAD");
  await page.getByRole("button", { name: m.newVersion, exact: true }).click();
  await page.getByLabel(m.minimumDriverAge, { exact: true }).fill("25");
  await page.getByRole("button", { name: m.publish, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Version 2", exact: true }),
  ).toBeVisible();
  const history = await owner.client.query(
    api.agencySettings.listPolicyHistory,
    { agencyId, paginationOpts: { numItems: 10, cursor: null } },
  );
  assert.deepEqual(
    history.page.map((p) => p.minimumDriverAge),
    [25, 21],
  );
  const policyToggle = page.getByRole("button", { name: /Version 1/ });
  await policyToggle.focus();
  await page.keyboard.press("Enter");
  await expect(policyToggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page
      .locator(".settings-policy-history")
      .filter({ has: policyToggle })
      .getByText("21", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(policyToggle).toHaveAttribute("aria-expanded", "false");

  await employeePage.goto(`${settingsUrl}/branches`);
  await expect(
    employeePage.getByRole("heading", {
      name: "Casablanca Airport Desk",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    employeePage.getByRole("button", { name: m.addBranch, exact: true }),
  ).toHaveCount(0);
  await expect(
    employeePage.getByRole("button", { name: m.edit, exact: true }),
  ).toHaveCount(0);
  await employeePage.goto(settingsUrl);
  await expect(
    employeePage.getByText(m.accessDenied, { exact: true }),
  ).toBeVisible();
  await employeePage.goto(`${settingsUrl}/policies`);
  await expect(
    employeePage.getByRole("heading", { name: "Version 2", exact: true }),
  ).toBeVisible();
  await expect(
    employeePage.getByRole("button", { name: m.newVersion, exact: true }),
  ).toHaveCount(0);
  for (const [locale, dictionary, language] of [
    ["ar", ar, "العربية"],
    ["fr", fr, "Français"],
    ["en", en, "English"],
  ]) {
    await page.locator(".language-trigger").click();
    await page
      .getByRole("menuitemradio", { name: language, exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    await expect(
      page.getByRole("heading", {
        name: dictionary.common.settings.version.replace("{version}", "2"),
        exact: true,
      }),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Policy ${locale} overflow at ${width}`,
      );
    }
    await page.setViewportSize({
      width: locale === "en" ? 1440 : 390,
      height: 1000,
    });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `${artifactPath}/phase3-policy-${locale}.png`,
      fullPage: true,
    });
  }
  await page.goto(settingsUrl);
  await page.getByLabel(m.legalName, { exact: true }).focus();
  await page.keyboard.press("Tab");
  assert(
    await page.evaluate(
      () => document.activeElement instanceof HTMLInputElement,
    ),
    "Keyboard focus must reach the next form field.",
  );
  await employeePage.goto(`${base}/app/${agencyId}`);
  await page.goto(`${base}/app/${agencyId}`);
  console.log(
    "PASS P3: policy publication/history, exact money entry, staff read-only permissions, localization and keyboard navigation.",
  );
}
