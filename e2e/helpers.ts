import { expect, Page } from '@playwright/test';

/** Registers a brand-new user through the UI and leaves the page signed in. */
export async function registerAndLogin(page: Page): Promise<{ email: string; password: string }> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = 'Password123!';
  await page.goto('/register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /register|sign up|create/i }).click();
  await expect(page).not.toHaveURL(/\/register$/);
  return { email, password };
}
