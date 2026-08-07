import { expect } from '@playwright/test'
import { Builder, By, until } from 'selenium-webdriver'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const projectRoot = process.cwd()
const webdriverUrl = 'http://127.0.0.1:4445'
const e2eServerUrl = 'http://127.0.0.1:4173'
const appReadyTimeout = 120_000
const uiTimeout = 20_000
const cargoBinPath = process.env.HOME ? join(process.env.HOME, '.cargo', 'bin') : ''

interface WindowDrivers {
  pet: any
  panel: any
}

interface LaunchHandle {
  driver: any
  panelDriver: any
  petDriver: any
  tauriDev: ChildProcess
  userDataDir: string
}

interface LaunchOptions {
  userDataDir?: string
}

const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

const waitForDevServer = async () => {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(e2eServerUrl, { method: 'GET' })
      if (response.ok) return
    } catch {
    }

    await sleep(1000)
  }

  throw new Error(`E2E web server did not become ready on ${e2eServerUrl}`)
}

const waitForWebDriver = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${webdriverUrl}/status`, { method: 'GET' })
      if (response.ok) return
    } catch {
    }

    await sleep(1000)
  }

  throw new Error('Tauri WebDriver did not become ready on http://127.0.0.1:4445')
}

const stopProcess = async (child: ChildProcess) => {
  if (child.killed || child.exitCode !== null) return

  if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  } else {
    child.kill('SIGTERM')
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null) return
    await sleep(250)
  }

  if (child.exitCode === null) {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    } else {
      child.kill('SIGKILL')
    }
  }
}

const connectDriver = async () => {
  const driver = await new Builder()
    .forBrowser('tauri')
    .usingServer(webdriverUrl)
    .build()

  await driver.wait(async () => {
    try {
      return (await driver.executeScript('return document.readyState')) === 'complete'
    } catch {
      return false
    }
  }, uiTimeout)

  return driver
}

const getWindowLabel = async (driver: any) => {
  return await driver.executeScript('return new URLSearchParams(window.location.search).get("window") ?? "main"')
}

const connectWindowDrivers = async (): Promise<WindowDrivers> => {
  const pet = await connectDriver()
  let panel = await connectDriver()
  let petLabel = await getWindowLabel(pet)
  let panelLabel = await getWindowLabel(panel)

  if (petLabel === panelLabel) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await panel.quit().catch(() => {})
      await sleep(250)
      panel = await connectDriver()
      panelLabel = await getWindowLabel(panel)
      if (panelLabel !== petLabel) break
    }
  }

  if (petLabel !== 'pet') {
    if (panelLabel === 'pet') {
      return { pet: panel, panel: pet }
    }
  }

  return { pet, panel }
}

const findByText = async (driver: any, text: string, selector = '*') => {
  const escaped = JSON.stringify(text)
  const element = await driver.wait(async () => {
    const found = await driver.executeScript(
      `
      const expected = ${escaped};
      const selector = arguments[0];
      return Array.from(document.querySelectorAll(selector)).find((node) => node.textContent?.trim() === expected) ?? null;
      `,
      selector
    )
    return found as any
  }, uiTimeout)

  return element as any
}

const killListenersOnPort = (port: number) => {
  const result = spawnSync('sh', ['-c', `lsof -ti tcp:${port} -sTCP:LISTEN | xargs -r kill`], {
    stdio: 'ignore'
  })

  return result.status === 0
}

const launchApp = async (options: LaunchOptions = {}): Promise<LaunchHandle> => {
  killListenersOnPort(4445)
  const userDataDir = options.userDataDir ?? mkdtempSync(join(tmpdir(), 'aievopet-tauri-playwright-'))
  const tauriDev = spawn('npm', ['run', 'tauri:e2e:serve'], {
    cwd: projectRoot,
    detached: true,
    env: {
      ...process.env,
      PATH: `${cargoBinPath}${cargoBinPath ? ':' : ''}/opt/homebrew/opt/rustup/bin:${process.env.PATH ?? ''}`,
      AI_PET_USER_DATA_DIR: userDataDir,
      TAURI_WEBDRIVER_PORT: '4445'
    },
    stdio: 'inherit'
  })

  await waitForDevServer()
  await waitForWebDriver()

  const { pet, panel } = await connectWindowDrivers()
  await pet.wait(until.elementLocated(By.css('[data-testid="pet-body"]')), appReadyTimeout)
  await pet.wait(async () => {
    const snapshot = await pet.executeScript('return window.__AI_PET_FLOATING_WINDOW__ ?? null;')
    return Boolean(snapshot?.bounds)
  }, uiTimeout)

  return { driver: pet, petDriver: pet, panelDriver: panel, tauriDev, userDataDir }
}

const closeApp = async ({ petDriver, panelDriver, tauriDev }: LaunchHandle) => {
  await petDriver.quit().catch(() => {})
  await panelDriver.quit().catch(() => {})
  await stopProcess(tauriDev)
}

const getPetBody = async (driver: any) => {
  const petBody = await driver.findElement(By.css('[data-testid="pet-body"]'))
  await driver.wait(until.elementIsVisible(petBody), uiTimeout)
  return petBody
}

const openPanel = async (app: LaunchHandle) => {
  const petBody = await getPetBody(app.petDriver)
  await petBody.click()

  await app.panelDriver.wait(async () => {
    const ready = await app.panelDriver.executeScript(
      `
      const visible = (node) => Boolean(node && (node.offsetParent || node.getClientRects().length));
      return Boolean(
        visible(document.querySelector('.onboarding-card'))
        || visible(document.querySelector('.chat-form input'))
        || visible(document.querySelector('.pet-panel-header-status strong'))
        || visible(document.querySelector('.companion-tab-row'))
        || visible(document.querySelector('.reminder-form input'))
      );
      `
    )
    return Boolean(ready)
  }, uiTimeout)

  return petBody
}

const dispatchHoverState = async (driver: any, hovering: boolean) => {
  await driver.executeScript(
    `
    const pet = document.querySelector('[data-testid="pet-body"]');
    if (!pet) return false;

    const rect = pet.getBoundingClientRect();
    const clientX = Math.round(rect.left + rect.width / 2);
    const clientY = Math.round(rect.top + rect.height / 2);
    const target = arguments[0] ? pet : document.body;
    const relatedTarget = arguments[0] ? document.body : pet;
    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      relatedTarget,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    };

    target.dispatchEvent(new PointerEvent(arguments[0] ? 'pointerover' : 'pointerout', eventInit));
    target.dispatchEvent(new PointerEvent(arguments[0] ? 'pointerenter' : 'pointerleave', eventInit));
    target.dispatchEvent(new MouseEvent(arguments[0] ? 'mouseover' : 'mouseout', eventInit));
    target.dispatchEvent(new MouseEvent(arguments[0] ? 'mouseenter' : 'mouseleave', eventInit));
    target.dispatchEvent(new MouseEvent('mousemove', eventInit));
    return true;
    `,
    hovering
  )
}

const collapseHoverChatWithEscape = async (driver: any) => {
  await driver.executeScript(
    `
    const input = document.querySelector('.hover-chat-form input[placeholder="和它搭句话…"]');
    if (!input) return false;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
      composed: true
    }));
    input.blur();
    return true;
    `
  )
}

const hoverPet = async (driver: any) => {
  const petBody = await getPetBody(driver)
  await dispatchHoverState(driver, true)
  await sleep(500)
  await driver.wait(until.elementLocated(By.css('.hover-chat-form input[placeholder="和它搭句话…"]')), uiTimeout)
  return petBody
}

const unhoverPet = async (driver: any) => {
  await dispatchHoverState(driver, false)
  await sleep(250)
}

const dragPetBy = async (driver: any, deltaX: number, deltaY: number) => {
  await driver.executeScript(
    `
    const pet = document.querySelector('[data-testid="pet-body"]');
    if (!pet) return false;

    const rect = pet.getBoundingClientRect();
    const startClientX = Math.round(rect.left + rect.width / 2);
    const startClientY = Math.round(rect.top + rect.height / 2);
    const startScreenX = Math.round(window.screenX + startClientX);
    const startScreenY = Math.round(window.screenY + startClientY);
    const nextScreenX = startScreenX + arguments[0];
    const nextScreenY = startScreenY + arguments[1];

    const downEvent = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: startClientX,
      clientY: startClientY,
      screenX: startScreenX,
      screenY: startScreenY,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      button: 0
    });
    pet.dispatchEvent(downEvent);

    const moveEvent = new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: startClientX + arguments[0],
      clientY: startClientY + arguments[1],
      screenX: nextScreenX,
      screenY: nextScreenY,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      button: 0
    });
    window.dispatchEvent(moveEvent);

    const upEvent = new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: startClientX + arguments[0],
      clientY: startClientY + arguments[1],
      screenX: nextScreenX,
      screenY: nextScreenY,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0
    });
    window.dispatchEvent(upEvent);
    return true;
    `,
    deltaX,
    deltaY
  )

  await sleep(300)
}

const getPetWindowRect = async (driver: any) => {
  const snapshot = await readFloatingWindowSnapshot(driver)
  if (snapshot?.bounds) {
    return {
      x: Number(snapshot.bounds.x ?? 0),
      y: Number(snapshot.bounds.y ?? 0),
      width: Number(snapshot.bounds.width ?? 0),
      height: Number(snapshot.bounds.height ?? 0)
    }
  }

  const rect = await driver.manage().window().getRect()
  return {
    x: Number(rect.x ?? 0),
    y: Number(rect.y ?? 0),
    width: Number(rect.width ?? 0),
    height: Number(rect.height ?? 0)
  }
}

const readFloatingWindowSnapshot = async (driver: any) => {
  return await driver.executeScript(
    'return window.__AI_PET_FLOATING_WINDOW__ ?? null;'
  )
}

const petSnapshotPath = (userDataDir: string) => join(userDataDir, 'pet.json')

const waitForPetSnapshot = async (userDataDir: string) => {
  await expect.poll(
    async () => existsSync(petSnapshotPath(userDataDir)),
    {
      timeout: 15_000,
      message: 'waiting for pet.json to be persisted'
    }
  ).toBe(true)
}

const readPetSnapshot = async (userDataDir: string) => {
  await waitForPetSnapshot(userDataDir)
  return JSON.parse(readFileSync(petSnapshotPath(userDataDir), 'utf8'))
}

const writePetSnapshot = async (userDataDir: string, pet: unknown) => {
  await waitForPetSnapshot(userDataDir)
  writeFileSync(petSnapshotPath(userDataDir), JSON.stringify(pet, null, 2))
}

export {
  appReadyTimeout,
  closeApp,
  collapseHoverChatWithEscape,
  findByText,
  hoverPet,
  launchApp,
  openPanel,
  dragPetBy,
  getPetWindowRect,
  readFloatingWindowSnapshot,
  readPetSnapshot,
  uiTimeout,
  unhoverPet,
  writePetSnapshot
}
