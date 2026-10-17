import { expect, test } from "@playwright/test";

test("TC-13 visitor searches by venue, refreshes, then clears", async ({
  page,
}) => {
  await page.goto("/events");
  await expect(page.getByText("Riyadh Jazz Night")).toBeVisible();

  const input = page.getByLabel("Search events");
  await input.fill("Boulevard");
  await expect(page).toHaveURL(/\?q=Boulevard/);
  await expect(page.getByText("Comedy Showcase")).toBeVisible();
  await expect(page.getByText("Riyadh Jazz Night")).toHaveCount(0);

  await page.reload();
  await expect(input).toHaveValue("Boulevard");
  await expect(page.getByText("Comedy Showcase")).toBeVisible();
  await expect(page.getByText("Riyadh Jazz Night")).toHaveCount(0);

  await input.fill("");
  await expect(page.getByText("Riyadh Jazz Night")).toBeVisible();
  await expect(page.getByText("Comedy Showcase")).toBeVisible();
  await expect(page.getByText("Spring Orchestra")).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]q=/);
});

test("TC-14 visitor sees the no-match message end to end", async ({ page }) => {
  await page.goto("/events");
  await page.getByLabel("Search events").fill("zzz-nothing");
  await expect(page.getByText("No events match your search")).toBeVisible();
});
