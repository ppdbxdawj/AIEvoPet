#!/usr/bin/env node
import process from 'node:process'

const DEFAULT_URL = process.env.AI_PET_EVENT_BRIDGE_URL || 'http://127.0.0.1:44557/coding-event'

const readStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const parsePayload = (raw) => {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const trim = (value) => typeof value === 'string' ? value.trim() : ''

const summarizeToolInput = (input) => {
  if (!input || typeof input !== 'object') return ''
  const description = trim(input.description)
  if (description) return description
  const command = trim(input.command)
  if (command) return command.length > 60 ? `${command.slice(0, 59)}…` : command
  const filePath = trim(input.file_path || input.path)
  if (filePath) return filePath
  return ''
}

const buildSummary = (payload) => {
  const eventName = trim(payload.hook_event_name)
  const notificationType = trim(payload.notification_type)
  const message = trim(payload.message)

  if (eventName === 'PermissionRequest') {
    const toolName = trim(payload.tool_name) || '工具'
    const toolDetail = summarizeToolInput(payload.tool_input)
    return toolDetail ? `任务：Claude Code 正在等待授权。需要你：确认 ${toolName}：${toolDetail}` : `任务：Claude Code 正在等待授权。需要你：确认 ${toolName} 操作`
  }

  if (eventName === 'Elicitation') {
    const serverName = trim(payload.server_name) || 'MCP'
    return `任务：Claude Code 需要补充选择。需要你：在 ${serverName} 里填写或选择。`
  }

  if (notificationType === 'permission_prompt') {
    return `任务：Claude Code 正在等待授权。需要你：${message || '授权一个操作。'}`
  }
  if (notificationType === 'elicitation_dialog') {
    return `任务：Claude Code 需要补充选择。需要你：${message || '填写或选择。'}`
  }
  if (notificationType === 'idle_prompt') {
    return `任务：Claude Code 暂停等待。需要你：${message || '继续输入。'}`
  }

  return `任务：Claude Code 暂停等待。需要你：${message || '操作后才能继续。'}`
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
  const payload = parsePayload(await readStdin())
  const summary = buildSummary(payload)
  await emitEvent({
    id: `coding-${Date.now()}`,
    kind: 'task-failed',
    source: 'claude-code',
    title: 'Claude Code 等待你操作',
    summary,
    status: 'failed',
    createdAt: new Date().toISOString(),
    metadata: {
      hookEventName: trim(payload.hook_event_name) || null,
      notificationType: trim(payload.notification_type) || null,
      toolName: trim(payload.tool_name) || null
    }
  })
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(0)
})
