import { expect, test } from '@playwright/test'
import { By, until } from 'selenium-webdriver'
import { closeApp, collapseHoverChatWithEscape, dragPetBy, getPetWindowRect, hoverPet, launchApp, openPanel, readFloatingWindowSnapshot, readPetSnapshot, uiTimeout, unhoverPet, writePetSnapshot } from './tauri-harness'

const clickButton = async (driver: any, label: string) => {
  const button = await driver.wait(until.elementLocated(By.xpath(`//button[normalize-space()=${JSON.stringify(label)}]`)), uiTimeout)
  await driver.wait(until.elementIsVisible(button), uiTimeout)
  await button.click()
}

const readPetCutoutImageSources = async (driver: any) => {
  return await driver.executeScript(
    `
    return Array.from(document.querySelectorAll('.pet-cutout-piece img'))
      .map((node) => node.getAttribute('src') ?? '')
      .filter(Boolean);
    `
  ) as string[]
}

const emitCodingEventInRenderer = async (driver: any, event: Record<string, unknown>) => {
  const accepted = await driver.executeAsyncScript(
    `
    const event = arguments[0];
    const done = arguments[arguments.length - 1];
    const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') {
      done({ ok: false, error: 'Tauri invoke unavailable' });
      return;
    }
    Promise.race([
      invoke('emit_coding_event', { event }),
      new Promise((resolve) => window.setTimeout(() => resolve({ accepted: false, timeout: true }), 5000))
    ]).then(
      (result) => done({ ok: Boolean(result?.accepted), result }),
      (error) => done({ ok: false, error: String(error) })
    );
    `,
    event
  ) as { ok: boolean; error?: string }
  expect(accepted).toEqual(expect.objectContaining({ ok: true }))
}

const completeOnboardingAndHatch = async (app: any, speciesLabel: '奶油小狗' | '草莓小猪' = '草莓小猪') => {
  const speciesValue = speciesLabel === '草莓小猪' ? 'piglet' : 'puppy'
  const { panelDriver } = app

  await openPanel(app)
  await panelDriver.wait(until.elementLocated(By.css('input[placeholder="比如：啵啵"]')), uiTimeout)

  await panelDriver.findElement(By.css('input[placeholder="比如：啵啵"]')).clear()
  await panelDriver.findElement(By.css('input[placeholder="比如：啵啵"]')).sendKeys('团团')
  await panelDriver.findElement(By.css('input[placeholder="比如：阿江"]')).clear()
  await panelDriver.findElement(By.css('input[placeholder="比如：阿江"]')).sendKeys('阿江')
  await clickButton(panelDriver, '进入外观设置')
  await clickButton(panelDriver, speciesLabel)

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
  await expect.poll(async () => await panelDriver.executeScript(
    `return document.body.textContent ?? '';`
  ), { timeout: 20_000 }).toContain(speciesLabel)

  await clickButton(panelDriver, '现在破壳')

  await expect.poll(async () => await panelDriver.executeScript(
    `
    const visible = (node) => Boolean(node && (node.offsetParent || node.getClientRects().length));
    const settingsButton = Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent?.trim() === '设置'
    );
    return {
      onboardingHidden: !document.querySelector('.onboarding-card'),
      settingsVisible: visible(settingsButton),
      chatVisible: visible(document.querySelector('.chat-form input')),
      petName: document.querySelector('.pet-panel-header-status strong')?.textContent?.trim() ?? null
    };
    `
  ), { timeout: 60_000 }).toEqual(expect.objectContaining({
    onboardingHidden: true,
    settingsVisible: true,
    chatVisible: true,
    petName: '团团'
  }))

  await expect.poll(async () => {
    const pet = await readPetSnapshot(app.userDataDir)
    return {
      stage: pet.state.stage,
      personalitySpecies: pet.personality.species,
      chosenSpecies: pet.memory.profile.chosenSpecies,
      petName: pet.personality.name
    }
  }, { timeout: 20_000 }).toEqual({
    stage: 'baby',
    personalitySpecies: speciesValue,
    chosenSpecies: speciesValue,
    petName: '团团'
  })
}

test('pet window stays compact and grows for hover chat', async () => {
  const app = await launchApp()

  try {
    const initialSnapshot = await readFloatingWindowSnapshot(app.petDriver)
    const initialRect = await getPetWindowRect(app.petDriver)
    expect(initialRect.width).toBeLessThan(900)
    expect(initialRect.height).toBeLessThan(1000)

    await hoverPet(app.petDriver)

    await expect.poll(async () => await readFloatingWindowSnapshot(app.petDriver), { timeout: 10_000 }).toEqual(expect.objectContaining({
      hoverChatExpanded: true,
      measured: true,
      insets: expect.objectContaining({
        bottom: expect.any(Number)
      }),
      bounds: expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number)
      })
    }))

    const snapshots = [] as Array<Awaited<ReturnType<typeof readFloatingWindowSnapshot>>>
    for (let attempt = 0; attempt < 4; attempt += 1) {
      snapshots.push(await readFloatingWindowSnapshot(app.petDriver))
      await app.petDriver.sleep(120)
    }

    const expandedSnapshot = snapshots.at(-1) ?? await readFloatingWindowSnapshot(app.petDriver)
    const expandedRect = await getPetWindowRect(app.petDriver)
    expect(expandedRect.width).toBeLessThan(900)
    expect(expandedRect.height).toBeLessThan(1000)
    expect(
      expandedSnapshot.insets.top !== initialSnapshot.insets.top
      || expandedSnapshot.insets.right !== initialSnapshot.insets.right
      || expandedSnapshot.insets.bottom !== initialSnapshot.insets.bottom
      || expandedSnapshot.insets.left !== initialSnapshot.insets.left
    ).toBe(true)

    const widths = snapshots.map((snapshot) => snapshot?.bounds.width ?? 0)
    const heights = snapshots.map((snapshot) => snapshot?.bounds.height ?? 0)
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(24)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(24)
  } finally {
    await closeApp(app)
  }
})

test('dragging the pet moves the compact window smoothly', async () => {
  const app = await launchApp()

  try {
    const initialRect = await getPetWindowRect(app.petDriver)
    await dragPetBy(app.petDriver, 120, -24)

    await expect.poll(async () => {
      const draggedRect = await getPetWindowRect(app.petDriver)
      return {
        movedRight: draggedRect.x > initialRect.x + 60,
        stayedNearY: Math.abs(draggedRect.y - initialRect.y) <= 80,
        width: draggedRect.width,
        height: draggedRect.height
      }
    }, { timeout: 20_000 }).toEqual(expect.objectContaining({
      movedRight: true,
      stayedNearY: true,
      width: expect.any(Number),
      height: expect.any(Number)
    }))
  } finally {
    await closeApp(app)
  }
})

test('hovering the pet opens the hover chat form', async () => {
  const app = await launchApp()

  try {
    const { driver } = app
    await hoverPet(driver)

    await expect.poll(async () => await driver.executeScript(
      `
      const input = document.querySelector('.hover-chat-form input[placeholder="和它搭句话…"]');
      return Boolean(input && (input.offsetParent || input.getClientRects().length));
      `
    ), { timeout: 10_000 }).toBe(true)

    const input = await driver.findElement(By.css('.hover-chat-form input[placeholder="和它搭句话…"]'))
    await input.sendKeys('测试一下 hover 聊天')
    await driver.findElement(By.css('.hover-chat-form button')).click()

    await expect.poll(async () => await driver.executeScript(
      `
      const input = document.querySelector('.hover-chat-form input');
      if (!input) return 'collapsed';
      return input.value === '' ? 'cleared' : input.value;
      `
    ), { timeout: 10_000 }).toMatch(/^(cleared|collapsed)$/)
  } finally {
    await closeApp(app)
  }
})

test('task-done coding event renders a visible standalone completion bubble', async () => {
  const app = await launchApp()

  try {
    await expect.poll(async () => await app.petDriver.executeScript(
      `return Boolean(window.__AI_PET_CODING_EVENT_READY__);`
    ), { timeout: 20_000 }).toBe(true)

    const id = `e2e-task-done-${Date.now()}`
    await emitCodingEventInRenderer(app.petDriver, {
      id,
      kind: 'task-done',
      source: 'claude-code',
      title: 'Claude Code 任务完成',
      summary: '任务：验证真实窗口完成气泡。需要你：不用操作，已完成。',
      status: 'succeeded',
      createdAt: new Date().toISOString(),
      metadata: { taskName: '验证真实窗口完成气泡' }
    })

    await expect.poll(async () => await app.petDriver.executeScript(
      `
      const bubble = document.querySelector('.bubble-slot.visible .chat-bubble');
      const rect = bubble?.getBoundingClientRect();
      return {
        text: bubble?.textContent ?? '',
        codingClass: Boolean(document.querySelector('.bubble-slot-coding')),
        visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        events: Array.from((window.__AI_PET_DEBUG__?.pet?.memory?.events ?? [])).slice(0, 4).map((event) => ({ id: event.id, type: event.type, summary: event.summary, tags: event.tags })),
        currentBubble: window.__AI_PET_DEBUG__?.bubble?.text ?? '',
        bubbleVisible: Boolean(window.__AI_PET_DEBUG__?.bubbleVisible),
        showBubble: window.__AI_PET_DEBUG__?.showState?.bubble?.text ?? ''
      };
      `
    ), { timeout: 10_000 }).toEqual(expect.objectContaining({
      text: expect.stringContaining('Claude Code｜完成了任务'),
      codingClass: true,
      visible: true
    }))
  } finally {
    await closeApp(app)
  }
})

test('escape collapses the hover chat and hover can reopen it', async () => {
  const app = await launchApp()

  try {
    const { driver } = app
    await hoverPet(driver)

    await driver.findElement(By.css('.hover-chat-form input[placeholder="和它搭句话…"]'))
    await collapseHoverChatWithEscape(driver)

    await driver.wait(until.elementLocated(By.xpath("//button[contains(normalize-space(), '聊聊')]")), uiTimeout)
    await unhoverPet(driver)
    await hoverPet(driver)
    await driver.wait(until.elementLocated(By.css('.hover-chat-form input[placeholder="和它搭句话…"]')), uiTimeout)
  } finally {
    await closeApp(app)
  }
})

test('opening the panel shows an interactive surface on first run', async () => {
  const app = await launchApp()

  try {
    await openPanel(app)
    await expect.poll(async () => await app.panelDriver.executeScript(
      `
      const visible = (node) => Boolean(node && (node.offsetParent || node.getClientRects().length));
      const onboarding = visible(document.querySelector('.onboarding-card'));
      const chat = visible(document.querySelector('.chat-form input'));
      return {
        onboarding,
        chat,
        ready: onboarding || chat
      };
      `
    ), { timeout: 20_000 }).toEqual(expect.objectContaining({
      ready: true
    }))
  } finally {
    await closeApp(app)
  }
})

test('first-run onboarding can hatch with a selected appearance asset', async () => {
  const app = await launchApp()

  try {
    await completeOnboardingAndHatch(app, '草莓小猪')
  } finally {
    await closeApp(app)
  }
})

test('care actions, reminders, and memory editor stay usable after hatching', async () => {
  const app = await launchApp()

  try {
    const { panelDriver } = app
    await completeOnboardingAndHatch(app, '奶油小狗')

    await clickButton(panelDriver, '照料')
    await expect.poll(async () => await panelDriver.executeScript(
      `return Array.from(document.querySelectorAll('.status-row span')).map((node) => node.textContent?.trim()).filter(Boolean);`
    ), { timeout: 60_000 }).toEqual(expect.arrayContaining(['饱腹', '健康']))

    await clickButton(panelDriver, '陪伴')
    await panelDriver.wait(until.elementLocated(By.css('.chat-form input')), uiTimeout)
    await clickButton(panelDriver, '喂食')
    const chatInput = await panelDriver.findElement(By.css('.chat-form input'))
    await chatInput.sendKeys('我喜欢热牛奶')
    await panelDriver.findElement(By.css('.chat-form button')).click()
    await expect.poll(async () => await panelDriver.executeScript(
      `return document.querySelector('.chat-form input')?.value ?? null;`
    ), { timeout: 60_000 }).toBe('')

    await panelDriver.findElement(By.css('.chat-form input')).sendKeys('我忙的时候轻一点')
    await panelDriver.findElement(By.css('.chat-form button')).click()
    await panelDriver.findElement(By.css('.chat-form input')).sendKeys('我压力大的时候聊聊散步')
    await panelDriver.findElement(By.css('.chat-form button')).click()

    await clickButton(panelDriver, '设置')
    await clickButton(panelDriver, '管理记忆')
    await expect.poll(async () => await panelDriver.executeScript(
      `return Array.from(document.querySelectorAll('.memory-editor-card .memory-chip-row')).map((node) => ({
        summary: node.querySelector('strong')?.textContent?.trim() ?? '',
        value: node.querySelectorAll('span')[0]?.textContent?.trim() ?? '',
        meta: node.querySelectorAll('span')[1]?.textContent?.trim() ?? ''
      }));`
    ), { timeout: 60_000 }).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: '轻一点',
        meta: expect.stringMatching(/^work · \d+%$/)
      }),
      expect.objectContaining({
        value: '热牛奶',
        meta: expect.stringMatching(/^[a-z-]+ · \d+%$/)
      })
    ]))
    await expect.poll(async () => await panelDriver.executeScript(
      `return document.querySelector('.memory-editor-card .reminder-empty')?.textContent?.trim() ?? '';`
    ), { timeout: 60_000 }).toContain('专注时偏好低打扰陪伴')

    await clickButton(panelDriver, '照料')
    await panelDriver.findElement(By.css('.reminder-form input')).sendKeys('喝水')
    await clickButton(panelDriver, '添加提醒')
    await expect.poll(async () => await panelDriver.executeScript(
      `return Array.from(document.querySelectorAll('.reminder-item strong')).map((node) => node.textContent?.trim()).filter(Boolean);`
    )).toContain('喝水')
  } finally {
    await closeApp(app)
  }
})

test('reopening the app reconciles pet state from elapsed time', async () => {
  const firstApp = await launchApp()
  const userDataDir = firstApp.userDataDir

  try {
    await completeOnboardingAndHatch(firstApp, '草莓小猪')
    await readPetSnapshot(userDataDir)
  } finally {
    await closeApp(firstApp)
  }

  const pet = await readPetSnapshot(userDataDir)
  pet.state.stage = 'baby'
  pet.state.ageDays = 0
  pet.state.hatchedAt = new Date(Date.now() - 16 * 86_400_000).toISOString()
  pet.state.lastInteractionAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString()
  pet.state.hunger = 15
  pet.state.energy = 80
  pet.state.cleanliness = 90
  pet.state.health = 95
  pet.state.mood = 80
  await writePetSnapshot(userDataDir, pet)

  const secondApp = await launchApp({ userDataDir })

  try {
    const { panelDriver } = secondApp
    await openPanel(secondApp)

    await expect.poll(async () => await panelDriver.executeScript(
      `
      return {
        hasChatInput: Boolean(document.querySelector('.interaction-card .chat-form input')),
        onboardingHidden: !document.querySelector('.onboarding-card'),
        petName: document.querySelector('.pet-panel-header-status strong')?.textContent?.trim() ?? null
      };
      `
    ), { timeout: 60_000 }).toEqual({
      hasChatInput: true,
      onboardingHidden: true,
      petName: '团团'
    })

    await clickButton(panelDriver, '照料')
    await expect.poll(async () => await panelDriver.executeScript(
      `return Array.from(document.querySelectorAll('.status-row span')).map((node) => node.textContent?.trim()).filter(Boolean);`
    ), { timeout: 60_000 }).toEqual(expect.arrayContaining(['饱腹', '精力', '清洁', '健康']))

    await expect.poll(async () => await panelDriver.executeScript(
      `
      const rows = Array.from(document.querySelectorAll('.status-row'));
      const readValue = (label) => {
        const row = rows.find((node) => node.querySelector('span')?.textContent?.trim() === label);
        if (!row) return null;
        const value = row.querySelector('.status-bar i')?.style.width ?? '';
        return Number.parseInt(value, 10);
      };
      return {
        hunger: readValue('饱腹'),
        energy: readValue('精力'),
        cleanliness: readValue('清洁'),
        health: readValue('健康'),
        stage: document.body.textContent?.includes('成熟期')
      };
      `
    ), { timeout: 60_000 }).toEqual(expect.objectContaining({
      stage: true,
      hunger: expect.any(Number),
      energy: expect.any(Number),
      cleanliness: expect.any(Number),
      health: expect.any(Number)
    }))
  } finally {
    await closeApp(secondApp)
  }
})
