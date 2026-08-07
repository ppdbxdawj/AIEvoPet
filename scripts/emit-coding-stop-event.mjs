#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import process from 'node:process'

const DEFAULT_URL = process.env.AI_PET_EVENT_BRIDGE_URL || 'http://127.0.0.1:44557/coding-event'
const SOURCE_LABELS = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  vscode: 'VS Code',
  codex: 'Codex',
  skill: '技能',
  manual: '任务'
}

const parseArgs = () => {
  const args = process.argv.slice(2)
  const sourceIndex = args.indexOf('--source')
  const source = sourceIndex >= 0 ? args[sourceIndex + 1] : 'manual'
  return Object.prototype.hasOwnProperty.call(SOURCE_LABELS, source) ? source : 'manual'
}

const readStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const parseHookPayload = (raw) => {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const textFromContent = (content) => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
}

const normalizeTaskText = (value) => value
  .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
  .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, ' ')
  .replace(/<timestamp>[\s\S]*?<\/timestamp>/g, ' ')
  .replace(/<user_query>/g, '')
  .replace(/<\/user_query>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\[[^\]]*Request interrupted[^\]]*\]/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const isMeaningfulUserText = (text) => {
  if (!text) return false
  if (/^(ok|okay|好|好的|可以|行|嗯|是|对|继续|yes|yep)$/i.test(text)) return false
  if (text.includes('Called the ') || text.includes('Result of calling the ')) return false
  if (text.includes('Briefly inform the user about the task result')) return false
  if (text.includes('Continue the conversation from where it left off')) return false
  if (text.includes('CRITICAL: Respond with TEXT ONLY')) return false
  return true
}

const extractTaskNameFromTranscript = async (transcriptPath) => {
  if (!transcriptPath || typeof transcriptPath !== 'string') return ''

  let raw = ''
  try {
    raw = await readFile(transcriptPath, 'utf8')
  } catch {
    return ''
  }

  let latest = ''
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let item
    try {
      item = JSON.parse(line)
    } catch {
      continue
    }

    const role = item.role || item.message?.role || item.type
    if (role !== 'user') continue

    const text = normalizeTaskText(textFromContent(item.message?.content ?? item.content))
    if (isMeaningfulUserText(text)) latest = text
  }

  return latest.length > 48 ? `${latest.slice(0, 47)}…` : latest
}

const emitEvent = async (event) => {
  const response = await fetch(DEFAULT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event })
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `bridge request failed (${response.status})`)
  }
  process.stdout.write(`${JSON.stringify(payload.event)}\n`)
}

const main = async () => {
  const source = parseArgs()
  const label = SOURCE_LABELS[source]
  const hookPayload = parseHookPayload(await readStdin())
  const taskName = await extractTaskNameFromTranscript(hookPayload.transcript_path)
  const summary = taskName ? `任务：${taskName}。需要你：不用操作，已完成。` : '任务：未识别到具体说明。需要你：不用操作，已完成。'

  await emitEvent({
    id: `coding-${Date.now()}`,
    kind: 'task-done',
    source,
    title: `${label} 任务完成`,
    summary,
    status: 'succeeded',
    createdAt: new Date().toISOString(),
    metadata: taskName ? { taskName } : undefined
  })
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(0)
})
