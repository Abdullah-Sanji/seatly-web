import { expect, test } from '@playwright/test';
import { registerAndLogin } from './helpers';

test.describe('smoke', () => {
  test('SMOKE-1 the events page lists the seeded events', async ({ page }) => {
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
    await expect(page.getByText('Riyadh Jazz Night')).toBeVisible();
    await expect(page.getByText('Comedy Showcase')).toBeVisible();
    await expect(page.getByText('Spring Orchestra')).toBeVisible();
  });

  test('SMOKE-2 a new user can register and open the event with sales on', async ({ page }) => {
    await registerAndLogin(page);
    await page.goto('/events');
    await page.getByText('Riyadh Jazz Night').click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
    await expect(page.getByText('King Fahd Cultural Centre')).toBeVisible();
  });
});
