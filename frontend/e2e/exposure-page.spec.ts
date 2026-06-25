import { test, expect } from '@playwright/test'

const EXPOSURE_ID = 'exposure.jaffle_shop.executive_orders_dashboard'

test.describe('Exposure Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Expand the Exposures folder in the sidebar, then open an exposure
    const sidebar = page.getByRole('complementary')
    await sidebar.getByRole('button', { name: /exposures/ }).click()
    await sidebar.getByRole('button', { name: 'executive_orders_dashboard' }).click()
    await page.waitForURL(/#\/exposure\//)
  })

  test('displays exposure title and Exposure badge', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('executive_orders_dashboard')
    await expect(page.getByText('Exposure', { exact: true })).toBeVisible()
  })

  test('shows the maturity badge', async ({ page }) => {
    await expect(page.getByTitle('Exposure maturity')).toContainText('high')
  })

  test('shows type and owner metadata', async ({ page }) => {
    const main = page.locator('main')
    await expect(main.getByText(/Type: dashboard/)).toBeVisible()
    await expect(main.getByText(/Owner: Analytics Team/)).toBeVisible()
  })

  test('renders "Open in Dashboard" link to the exposure url', async ({ page }) => {
    const link = page.getByRole('link', { name: /Open in Dashboard/ })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', 'https://bi.example.com/dashboards/executive-orders')
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('shows the upstream data health rollup', async ({ page }) => {
    const main = page.locator('main')
    await expect(main.getByRole('heading', { name: 'Upstream data health' })).toBeVisible()
  })

  test('renders the lineage context subgraph', async ({ page }) => {
    const main = page.locator('main')
    await expect(main.getByRole('heading', { name: 'Lineage Context' })).toBeVisible()
  })
})

test.describe('Exposure Not Found', () => {
  test('shows not found message for invalid exposure id', async ({ page }) => {
    await page.goto('/#/exposure/nonexistent-exposure-id')
    await expect(page.getByText(/not found/i)).toBeVisible()
  })
})

test.describe('Exposure routing', () => {
  test('redirects /model/exposure.* to /exposure/*', async ({ page }) => {
    await page.goto(`/#/model/${EXPOSURE_ID}`)
    await page.waitForURL(/#\/exposure\//)
    await expect(page.locator('h1')).toContainText('executive_orders_dashboard')
  })
})
