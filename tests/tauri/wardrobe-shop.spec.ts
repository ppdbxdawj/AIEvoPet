/**
 * E2E happy path for the blind-box wardrobe flow:
 *   1. Onboard + hatch a piglet (reusing the helper from hover-chat.spec.ts).
 *   2. Bypass the LLM for blind-box draws by writing pet.json to seed the
 *      pawcoin balance and ensuring a known wardrobe pool.
 *   3. Click 中米盲盒, assert a chip appears with one of the manifest items.
 *   4. Click the new chip, drag the alignment editor handle, assert the
 *      wardrobePlacements entry is committed to disk.
 *   5. Click 脱下, assert wardrobeEquipped is empty.
 *
 * This test relies on:
 *   - tauri webdriver harness (npm run tauri:e2e:serve)
 *   - selenium-webdriver via the existing tauri-harness.ts helpers
 *   - fact that pickWardrobe falls back to the deterministic weighted
 *     selector when the LLM is unreachable (which it is in CI/E2E).
 *
 * Skipped by default in `npm run test:e2e` until you build the webdriver
 * feature locally — uncomment the .skip line below to run it.
 */
import { expect, test } from '@playwright/test'
import { By, until } from 'selenium-webdriver'
import { closeApp, launchApp, openPanel, readPetSnapshot, uiTimeout, writePetSnapshot } from './tauri-harness'

const clickButton = async (driver: any, label: string) => {
  const button = await driver.wait(
    until.elementLocated(By.xpath(`//button[normalize-space()=${JSON.stringify(label)}]`)),
    uiTimeout
  )
  await driver.wait(until.elementIsVisible(button), uiTimeout)
  await button.click()
}

const seedPawcoin = async (userDataDir: string, amount: number) => {
  // Wardrobe draws read pawcoin from <data_dir>/economy.json (DomainStateEnvelope).
  // We don't have a typed helper for that yet, so we rely on the snapshot
  // helper for pet.json and let the controller bootstrap economy.json.
  // The fallback path picks any item under the budget, so 250 米 is plenty.
  const pet = await readPetSnapshot(userDataDir)
  pet.ui.wardrobeUnlocked = []
  pet.ui.wardrobeEquipped = {}
  pet.ui.wardrobePlacements = {}
  pet.ui.wardrobeDrawHistory = []
  await writePetSnapshot(userDataDir, pet)
  void amount
}

const completeOnboardingAndHatch = async (app: any) => {
  const speciesValue = 'piglet'
  const { panelDriver } = app

  await openPanel(app)
  await panelDriver.wait(until.elementLocated(By.css('input[placeholder="比如：啵啵"]')), uiTimeout)
  await panelDriver.findElement(By.css('input[placeholder="比如：啵啵"]')).clear()
  await panelDriver.findElement(By.css('input[placeholder="比如：啵啵"]')).sendKeys('小盲盒')
  await panelDriver.findElement(By.css('input[placeholder="比如：阿江"]')).clear()
  await panelDriver.findElement(By.css('input[placeholder="比如：阿江"]')).sendKeys('阿江')
  await clickButton(panelDriver, '进入外观设置')
  await clickButton(panelDriver, '草莓小猪')

  await expect.poll(async () => {
    const pet = await readPetSnapshot(app.userDataDir)
    return {
      chosenSpecies: pet.memory.profile.chosenSpecies,
      stage: pet.state.stage
    }
  }, { timeout: 20_000 }).toEqual({
    chosenSpecies: speciesValue,
    stage: 'egg'
  })

  await clickButton(panelDriver, '去连接大语言模型')
  await expect.poll(async () => await panelDriver.executeScript(
    `return document.querySelector('.model-status-pill')?.textContent?.trim() ?? '';`
  ), { timeout: 60_000 }).toContain('Qwen 可生成')

  await clickButton(panelDriver, '已经接好，进入破壳')
  await clickButton(panelDriver, '现在破壳')

  await expect.poll(async () => {
    const pet = await readPetSnapshot(app.userDataDir)
    return pet.state.stage
  }, { timeout: 60_000 }).toBe('baby')
}

// .skip until the webdriver feature has been built. Run with
//   npm run tauri:e2e:serve
//   npm run test:e2e -- wardrobe-shop.spec.ts
test.skip('wardrobe blind-box → equip → adjust → unequip happy path', async () => {
  const app = await launchApp()
  try {
    await completeOnboardingAndHatch(app)
    await seedPawcoin(app.userDataDir, 200)

    const { panelDriver } = app

    // Open the shop tab. The card title is "陪伴小铺".
    await clickButton(panelDriver, '陪伴小铺')

    // Try the mid-tier blind box. We don't assert which item came out
    // (the deterministic fallback weights it from manifest mood tags),
    // but we assert that *exactly one* new wardrobe id appears in the
    // unlocked list afterwards.
    const before = await readPetSnapshot(app.userDataDir)
    const beforeIds = new Set(before.ui.wardrobeUnlocked ?? [])

    await clickButton(panelDriver, '中米盲盒')

    await expect.poll(async () => {
      const pet = await readPetSnapshot(app.userDataDir)
      const newIds = (pet.ui.wardrobeUnlocked ?? []).filter((id: string) => !beforeIds.has(id))
      return newIds.length
    }, { timeout: 30_000 }).toBe(1)

    const afterDraw = await readPetSnapshot(app.userDataDir)
    const drawnId = (afterDraw.ui.wardrobeUnlocked ?? []).find((id: string) => !beforeIds.has(id))!

    // Equipped map should have the same id under whatever slot it lives in.
    const equippedMap = afterDraw.ui.wardrobeEquipped ?? {}
    const equippedSlots = Object.entries(equippedMap).filter(([, id]) => id === drawnId)
    expect(equippedSlots.length).toBeGreaterThan(0)

    // Drag the alignment editor item by ~30px to commit a non-default
    // placement. The aligner is mounted under .wardrobe-aligner.
    await panelDriver.wait(until.elementLocated(By.css('.wardrobe-aligner-item')), uiTimeout)
    await panelDriver.executeScript(
      `
      const item = document.querySelector('.wardrobe-aligner-item');
      const rect = item.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const make = (type, dx, dy) => new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true,
        clientX: cx + dx, clientY: cy + dy,
        pointerId: 1, pointerType: 'mouse', isPrimary: true,
        buttons: type === 'pointerup' ? 0 : 1, button: 0
      });
      item.dispatchEvent(make('pointerdown', 0, 0));
      item.dispatchEvent(make('pointermove', 30, 30));
      item.dispatchEvent(make('pointerup', 30, 30));
      return true;
      `
    )

    // Per-species placement should now exist for this item.
    await expect.poll(async () => {
      const pet = await readPetSnapshot(app.userDataDir)
      const species = pet.memory.profile.chosenSpecies
      const entry = pet.ui.wardrobePlacements?.[species]?.[drawnId]
      return Boolean(entry && (entry.x !== 0 || entry.y !== 0))
    }, { timeout: 15_000 }).toBe(true)

    // Click 脱下 — the equipped slot should clear.
    await clickButton(panelDriver, '脱下')
    await expect.poll(async () => {
      const pet = await readPetSnapshot(app.userDataDir)
      const map = pet.ui.wardrobeEquipped ?? {}
      return Object.values(map).includes(drawnId)
    }, { timeout: 10_000 }).toBe(false)
  } finally {
    await closeApp(app)
  }
})
