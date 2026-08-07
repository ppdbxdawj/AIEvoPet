import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/tauri',
  timeout: 120_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  workers: 1
})
