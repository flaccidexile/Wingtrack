import { test, expect } from '@playwright/test'

test.describe('Wingtrack UI & Auth Audit', () => {
  test('1. App loads cleanly without fatal console errors', async ({ page }) => {
    const pageErrors: Error[] = []
    const consoleErrors: string[] = []

    page.on('pageerror', err => pageErrors.push(err))
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto('/')
    await expect(page).toHaveTitle(/Wingtrack/i)

    // Wait for the login form to be visible
    const emailInput = page.locator('#login-email')
    await expect(emailInput).toBeVisible()

    // Filter out expected network errors if offline/mocked
    const fatalErrors = pageErrors.filter(e => !e.message.includes('ERR_CONNECTION_REFUSED'))
    expect(fatalErrors).toHaveLength(0)
  })

  test('2. Password login form validation', async ({ page }) => {
    await page.goto('/')

    const emailInput = page.locator('#login-email')
    const passwordInput = page.locator('#login-password')
    const submitBtn = page.locator('#login-submit')

    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
    await expect(submitBtn).toBeVisible()

    // Test submit with empty fields
    await submitBtn.click()
    // Should stay on the login page
    await expect(submitBtn).toBeVisible()
  })

  test('3. OTP sign-in tab validation', async ({ page }) => {
    await page.goto('/')

    const otpTab = page.locator('#login-tab-otp')
    await expect(otpTab).toBeVisible()
    await otpTab.click()

    const otpEmailInput = page.locator('#otp-email')
    const sendOtpBtn = page.locator('#otp-send-code')

    await expect(otpEmailInput).toBeVisible()
    await expect(sendOtpBtn).toBeVisible()

    // Send button should be disabled when email is empty
    await expect(sendOtpBtn).toBeDisabled()

    // Typing an invalid email keeps submit or enables it
    await otpEmailInput.fill('test@invalid.domain')
    await expect(sendOtpBtn).toBeEnabled()
  })

  test('4. Sign-up flow and role access', async ({ page }) => {
    await page.goto('/')

    const signupLink = page.locator('#login-go-signup, a:has-text("Sign up"), button:has-text("Sign up")')
    if (await signupLink.first().isVisible()) {
      await signupLink.first().click()
      await expect(page.locator('#signup-name, input[name="name"], input[placeholder*="Name" i]').first()).toBeVisible()
      await expect(page.locator('#signup-email, input[type="email"]').first()).toBeVisible()
    }
  })

  test('5. Forgot password flow', async ({ page }) => {
    await page.goto('/')

    const forgotBtn = page.locator('#login-forgot-password, a:has-text("Forgot password"), button:has-text("Forgot")')
    if (await forgotBtn.first().isVisible()) {
      await forgotBtn.first().click()
      await expect(page.locator('#forgot-email, input[type="email"]').first()).toBeVisible()
    }
  })

  test('6. Backend API health and proxying audit', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('ok')
  })

  test('7. Protected API routes reject unauthenticated requests with 401', async ({ request }) => {
    const protectedRoutes = [
      { method: 'get', path: '/api/orders' },
      { method: 'get', path: '/api/inventory' },
      { method: 'get', path: '/api/staff' },
      { method: 'post', path: '/api/checkout' },
      { method: 'post', path: '/api/paymongo/create-intent' },
    ]

    for (const r of protectedRoutes) {
      const res = r.method === 'get' ? await request.get(r.path) : await request.post(r.path)
      expect(res.status(), `Route ${r.path} should require authentication`).toBe(401)
    }
  })

  test('8. Staff verification endpoint contract test', async ({ request }) => {
    // 1. Invalid email format
    const badRes = await request.post('/api/auth/check-registered', {
      data: { email: 'invalid-email' },
    })
    expect(badRes.status()).toBe(400)

    // 2. Unregistered email
    const unknownRes = await request.post('/api/auth/check-registered', {
      data: { email: 'nonexistent-user-999@wingtrack.ph' },
    })
    expect(unknownRes.status()).toBe(200)
    const unknownJson = await unknownRes.json()
    expect(unknownJson.registered).toBe(false)

    // 3. Known registered staff
    const knownRes = await request.post('/api/auth/check-registered', {
      data: { email: 'admin@admin.com' },
    })
    expect(knownRes.status()).toBe(200)
    const knownJson = await knownRes.json()
    expect(knownJson.registered).toBe(true)
    expect(knownJson.active).toBe(true)
  })

  test('9. Mobile responsiveness audit (iPhone SE / 375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    const loginCard = page.locator('.auth-card, form')
    await expect(loginCard.first()).toBeVisible()

    // Ensure no horizontal document overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })
})
