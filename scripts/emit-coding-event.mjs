#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import process from 'node:process'

const DEFAULT_URL = process.env.AI_PET_EVENT_BRIDGE_URL || 'http://127.0.0.1:44557/coding-event'
const VALID_KINDS = new Set([
  'task-start',
  'task-done',
  'task-failed',
  'commit-created',
  'test-pass',
  'test-fail',
  'build-pass',
  'build-fail'
])
const VALID_SOURCES = new Set(['claude-code', 'codex', 'cursor', 'vscode', 'skill', 'manual'])
const VALID_STATUS = new Set(['running', 'succeeded', 'failed'])

const usage = () => {
  process.stderr.write(`Usage:\n  node scripts/emit-coding-event.mjs '{"kind":"task-done",...}'\n  node scripts/emit-coding-event.mjs --file path/to/event.json\n\nEnvironment:\n  AI_PET_EVENT_BRIDGE_URL   HTTP endpoint (default: ${DEFAULT_URL})\n`)
}

const readInput = async () => {
  const [, , first, second] = process.argv

  if (!first) {
    usage()
    process.exit(1)
  }

  if (first === '--file') {
    if (!second) {
      usage()
      process.exit(1)
    }
    return readFile(second, 'utf8')
  }

  return first
}

const normalizeEvent = (value) => {
  if (!value || typeof value !== 'object') {
    throw new Error('event must be a JSON object')
  }

  const kind = typeof value.kind === 'string' ? value.kind.trim() : ''
  const source = typeof value.source === 'string' ? value.source.trim() : 'manual'
  const status = typeof value.status === 'string' ? value.status.trim() : ''
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const summary = typeof value.summary === 'string' ? value.summary.trim() : undefined
  const createdAt = typeof value.createdAt === 'string' && value.createdAt.trim() ? value.createdAt : new Date().toISOString()
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : `coding-${Date.now()}`

  if (!VALID_KINDS.has(kind)) throw new Error(`invalid kind: ${kind}`)
  if (!VALID_SOURCES.has(source)) throw new Error(`invalid source: ${source}`)
  if (!VALID_STATUS.has(status)) throw new Error(`invalid status: ${status}`)
  if (!title) throw new Error('title required')
  if (Number.isNaN(new Date(createdAt).getTime())) throw new Error('createdAt must be ISO datetime')

  const metadata = value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata)
    ? Object.fromEntries(Object.entries(value.metadata).filter(([, item]) => item === null || ['string', 'number', 'boolean'].includes(typeof item)))
    : undefined

  return {
    id,
    kind,
    source,
    title,
    summary,
    status,
    createdAt,
    metadata
  }
}

const main = async () => {
  const raw = await readInput()
  const parsed = JSON.parse(raw)
  const event = normalizeEvent(parsed)

  const response = await fetch(DEFAULT_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ event })
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `bridge request failed (${response.status})`)
  }

  process.stdout.write(`${JSON.stringify(payload.event)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
