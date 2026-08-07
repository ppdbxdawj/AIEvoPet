#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const MIN_NODE_MAJOR = 20
const MIN_NPM_MAJOR = 10
const RUSTUP_INSTALL_COMMAND = 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh'
const NODE_REINSTALL_COMMANDS = ['brew install node', 'npm install -g npm@latest']
const TTY_REOPEN_COMMAND = 'exec $SHELL -l'
const OLLAMA_SETUP_COMMANDS = ['brew install --cask ollama', 'ollama pull qwen3:4b-instruct']
const RUSTUP_BIN_DIR = path.join(os.homedir(), '.cargo', 'bin')

const writeStep = (message) => {
  process.stdout.write(`\n==> ${message}\n`)
}

const writeError = (message) => {
  process.stderr.write(`${message}\n`)
}

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    stdio: options.stdio ?? 'pipe',
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd(),
    shell: false
  })

  let stdout = ''
  let stderr = ''

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
  }

  child.on('error', reject)
  child.on('close', (code) => {
    if (code === 0) {
      resolve({ stdout, stderr })
      return
    }

    const error = new Error(stderr.trim() || stdout.trim() || `${command} ${args.join(' ')} failed with exit code ${code}`)
    error.code = code
    reject(error)
  })
})

const spawnInherited = (command, args) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
    shell: false
  })

  child.on('close', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })

  child.on('error', (error) => {
    writeError(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

const fileExists = async (path) => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const ensureRustupBinOnPath = async () => {
  const currentPath = process.env.PATH ?? ''
  const pathEntries = currentPath.split(path.delimiter).filter(Boolean)
  if (pathEntries.includes(RUSTUP_BIN_DIR)) return false
  if (!(await fileExists(RUSTUP_BIN_DIR))) return false
  process.env.PATH = [RUSTUP_BIN_DIR, ...pathEntries].join(path.delimiter)
  return true
}

const parseMajor = (value) => {
  const match = value.trim().match(/v?(\d+)/)
  return match ? Number.parseInt(match[1], 10) : Number.NaN
}

const printCommands = (commands, label = '可直接复制的命令：') => {
  if (!commands.length) return
  writeError(`  - ${label}`)
  for (const command of commands) {
    writeError(`      ${command}`)
  }
}

const failWithGuidance = ({ title, bullets, commands = [], commandLabel, extra }) => {
  writeError(`\n✖ ${title}`)
  writeError('  - 建议按下面的 checklist 处理：')
  for (const bullet of bullets) {
    writeError(`      ${bullet}`)
  }
  printCommands(commands, commandLabel)
  if (extra) {
    writeError(`  - 原始错误：${extra}`)
  }
  process.exit(1)
}

const requireNodeVersion = () => {
  writeStep('Checking Node.js')
  const major = parseMajor(process.version)
  if (major >= MIN_NODE_MAJOR) {
    process.stdout.write(`Node.js ${process.version} detected.\n`)
    return
  }

  failWithGuidance({
    title: `Node.js ${MIN_NODE_MAJOR}+ is required. Current version: ${process.version}.`,
    bullets: [
      '安装或升级到较新的 Node.js 版本。',
      '让 npm 也跟着切到新版本。',
      '重新打开终端后再回仓库启动。'
    ],
    commands: [...NODE_REINSTALL_COMMANDS, TTY_REOPEN_COMMAND, 'npm run app:dev']
  })
}

const requireNpmVersion = async () => {
  writeStep('Checking npm')
  try {
    const { stdout } = await run('npm', ['-v'])
    const version = stdout.trim()
    const major = parseMajor(version)

    if (major >= MIN_NPM_MAJOR) {
      process.stdout.write(`npm ${version} detected.\n`)
      return
    }

    failWithGuidance({
      title: `npm ${MIN_NPM_MAJOR}+ is required. Current version: ${version}.`,
      bullets: [
        '升级 npm 到较新版本。',
        '重新打开终端，让新版本生效。',
        '然后重新运行一键启动。'
      ],
      commands: ['npm install -g npm@latest', TTY_REOPEN_COMMAND, 'npm run app:dev']
    })
  } catch (error) {
    failWithGuidance({
      title: 'Unable to run npm -v.',
      bullets: [
        '确认 Node.js 和 npm 已安装并在 PATH 中。',
        '如果刚装完 Node.js，先开一个新的终端窗口。',
        '然后重新执行一键启动。'
      ],
      commands: [...NODE_REINSTALL_COMMANDS, TTY_REOPEN_COMMAND, 'npm run app:dev'],
      extra: error instanceof Error ? error.message : String(error)
    })
  }
}

const ensureNodeModules = async () => {
  writeStep('Checking JavaScript dependencies')
  if (await fileExists(new URL('../node_modules', import.meta.url))) {
    process.stdout.write('Dependencies already installed.\n')
    return
  }

  process.stdout.write('node_modules is missing. Running npm install...\n')

  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['install'], {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd(),
      shell: false
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(undefined)
        return
      }
      reject(new Error(`npm install failed with exit code ${code}`))
    })
  }).catch((error) => {
    failWithGuidance({
      title: 'npm install did not complete successfully.',
      bullets: [
        '先修复上面 npm install 的报错。',
        '依赖装好后，再重新执行一键启动。'
      ],
      commands: ['npm install', 'npm run app:dev'],
      extra: error instanceof Error ? error.message : String(error)
    })
  })
}

const requireCommand = async ({ command, args, successLabel, title, bullets, commands = [] }) => {
  try {
    const { stdout } = await run(command, args)
    process.stdout.write(`${successLabel || stdout.trim()}\n`)
  } catch (error) {
    failWithGuidance({
      title,
      bullets,
      commands,
      extra: error instanceof Error ? error.message : String(error)
    })
  }
}

const requireRustToolchain = async () => {
  writeStep('Checking Rust toolchain')
  const injectedRustupBin = await ensureRustupBinOnPath()
  if (injectedRustupBin) {
    process.stdout.write(`Detected rustup at ${RUSTUP_BIN_DIR} and added it to PATH for this launch.\n`)
  }
  await requireCommand({
    command: 'cargo',
    args: ['-V'],
    title: 'Cargo is missing from this shell.',
    bullets: os.platform() === 'darwin'
      ? [
          '先补齐 macOS Command Line Tools。',
          '再安装 Rust toolchain，让 cargo 和 rustc 可用。',
          '安装完成后重新打开终端。',
          '最后回仓库再次执行一键启动。'
        ]
      : [
          '先安装 Rust toolchain。',
          '安装完成后重新打开终端。',
          '最后重新执行 npm run app:dev。'
        ],
    commands: os.platform() === 'darwin'
      ? [
          'xcode-select --install',
          RUSTUP_INSTALL_COMMAND,
          TTY_REOPEN_COMMAND,
          'npm run app:dev'
        ]
      : [RUSTUP_INSTALL_COMMAND, TTY_REOPEN_COMMAND, 'npm run app:dev']
  })
  await requireCommand({
    command: 'rustc',
    args: ['-V'],
    title: 'rustc is missing from this shell.',
    bullets: [
      '补齐 Rust toolchain，让 rustc 能被终端找到。',
      '安装完成后重新打开终端。',
      '然后重新运行一键启动。'
    ],
    commands: [RUSTUP_INSTALL_COMMAND, TTY_REOPEN_COMMAND, 'npm run app:dev']
  })
}

const requireTauriCli = async () => {
  writeStep('Checking local Tauri CLI')
  try {
    const { stdout } = await run('npx', ['tauri', '-V'])
    process.stdout.write(`${stdout.trim()}\n`)
  } catch (error) {
    failWithGuidance({
      title: 'The local Tauri CLI is unavailable.',
      bullets: [
        '先确认这个仓库里的 npm 依赖已经装完整。',
        '如果 node_modules 损坏，删掉后重新安装。',
        '这个项目走的是本地 @tauri-apps/cli + npx，不依赖全局 tauri。',
        '依赖恢复后重新执行一键启动。'
      ],
      commands: [
        'rm -rf node_modules package-lock.json',
        'npm install',
        'npm run app:dev'
      ],
      extra: error instanceof Error ? error.message : String(error)
    })
  }
}

const printOllamaHint = async () => {
  writeStep('Checking optional Ollama support')
  try {
    const { stdout } = await run('ollama', ['-v'])
    process.stdout.write(`${stdout.trim()}\n`)
    process.stdout.write('Ollama is installed. The app will still auto-start the local model service when needed.\n')
    process.stdout.write('If you want the full local-model path, make sure qwen3:4b-instruct is available before onboarding.\n')
  } catch {
    process.stdout.write('Ollama is not installed. The app can still launch and will use fallback copy until a local model is available.\n')
    process.stdout.write('Optional checklist:\n')
    process.stdout.write('  1. 安装 Ollama。\n')
    process.stdout.write('  2. 拉取 qwen3:4b-instruct。\n')
    process.stdout.write('  3. 重新执行 npm run app:dev。\n')
    process.stdout.write('Optional setup commands:\n')
    for (const command of OLLAMA_SETUP_COMMANDS) {
      process.stdout.write(`  ${command}\n`)
    }
  }
}

const main = async () => {
  requireNodeVersion()
  await requireNpmVersion()
  await ensureNodeModules()
  await requireRustToolchain()
  await requireTauriCli()
  await printOllamaHint()
  writeStep('Starting Tauri dev')
  spawnInherited('npx', ['tauri', 'dev'])
}

main().catch((error) => {
  writeError(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
