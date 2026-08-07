import { describe, expect, it } from 'vitest'
import { createDefaultPet } from '../lib/default-pet'
import type { PetCodingEvent, PetData, PetGeneratedReply } from '../types/pet'

const mapActionToEmotion = (action: PetGeneratedReply['action'], loneliness: number) => {
  if (action === 'happy' || action === 'blush' || action === 'celebrating') return 'happy' as const
  if (action === 'sleepy' || action === 'thinking' || action === 'reviewing' || action === 'waiting') return 'calm' as const
  if (action === 'hungry' || action === 'failed') return 'sad' as const
  if (action === 'talking' || action === 'alert') return loneliness > 55 ? ('lonely' as const) : ('excited' as const)
  return loneliness > 55 ? ('lonely' as const) : ('calm' as const)
}

const createCodingEventMemory = (
  event: PetCodingEvent,
  action: PetGeneratedReply['action'],
  loneliness: number,
  sceneId?: PetData['memory']['working']['currentScene']
) => ({
  id: event.id,
  ts: event.createdAt,
  type: event.kind,
  summary: event.summary?.trim() || event.title,
  petEmotion: mapActionToEmotion(action, loneliness),
  importance: event.status === 'failed' || event.kind === 'commit-created' ? 3 : 2,
  sceneId,
  tags: [event.kind, event.source, event.status, ...(sceneId ? [sceneId] : [])]
})

const formatCodingEventSource = (source: PetCodingEvent['source']) => {
  if (source === 'claude-code') return 'Claude Code'
  if (source === 'cursor') return 'Cursor'
  if (source === 'vscode') return 'VS Code'
  if (source === 'codex') return 'Codex'
  if (source === 'skill') return '技能'
  return '任务'
}

const isGenericCodingEventText = (text: string) => {
  const normalized = text.trim()
  return !normalized
    || /^Agent has stopped/i.test(normalized)
    || /^Claude Code finished a turn/i.test(normalized)
    || /^Notification raised by the Claude Code agent/i.test(normalized)
    || /^Claude Code 已完成一个任务。?$/.test(normalized)
    || /^任务：未识别到具体说明。需要你：不用操作，已完成。?$/.test(normalized)
}

const getCodingEventMetadataText = (event: PetCodingEvent, key: string) => {
  const value = event.metadata?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

const extractCodingTaskText = (summary?: string) => {
  const text = summary?.trim() ?? ''
  const match = /^任务：(.+?)。需要你：不用操作，已完成。?$/.exec(text)
  return match?.[1]?.trim() ?? ''
}

const getCodingEventStatusText = (event: PetCodingEvent) => {
  if (event.kind === 'task-done' && event.status === 'succeeded') return '完成了任务'
  if (event.status === 'failed' || event.kind === 'task-failed' || event.kind === 'test-fail' || event.kind === 'build-fail') return '需要你操作'
  if (event.status === 'running' || event.kind === 'task-start') return '正在处理'
  return '收到事件'
}

const getCodingEventPrimaryText = (event: PetCodingEvent) => {
  const taskName = getCodingEventMetadataText(event, 'taskName') || extractCodingTaskText(event.summary)
  if (taskName) return `任务：${taskName}`

  const command = getCodingEventMetadataText(event, 'command')
  if (command) return command.length > 80 ? `${command.slice(0, 79)}…` : command

  const summary = event.summary?.trim() ?? ''
  if (!isGenericCodingEventText(summary)) return summary

  const title = event.title.trim()
  return isGenericCodingEventText(title) ? `${formatCodingEventSource(event.source)} 事件已收到` : title
}

const formatCodingEventText = (event: PetCodingEvent) => {
  const text = getCodingEventPrimaryText(event)
  if (event.kind === 'task-done' && event.status === 'succeeded') {
    return `【${formatCodingEventSource(event.source)}｜完成了任务】\n${text}`
  }
  if (event.status === 'failed' || event.kind === 'task-failed' || event.kind === 'test-fail' || event.kind === 'build-fail') {
    return `【${formatCodingEventSource(event.source)}｜需要你操作】\n${text}`
  }
  if (event.status === 'running' || event.kind === 'task-start') {
    return `【${formatCodingEventSource(event.source)}｜正在处理】\n${text}`
  }
  return `【${formatCodingEventSource(event.source)}｜收到事件】\n${text}`
}

const toCodingEventPresentation = (event: PetCodingEvent) => {
  const text = formatCodingEventText(event)

  if (event.kind === 'commit-created') {
    return {
      reply: {
        text,
        action: 'celebrating' as const,
        show: {
          intent: 'celebrate' as const,
          bubble: {
            kind: 'speech' as const,
            text,
            tone: 'playful' as const,
            ttlMs: 5600
          },
          expression: { eyes: 'sparkle' as const, mouth: 'smile' as const },
          animKey: 'bounce' as const
        }
      },
      shouldRecordMemory: true
    }
  }

  if (event.status === 'failed' || event.kind === 'task-failed' || event.kind === 'test-fail' || event.kind === 'build-fail') {
    return {
      reply: {
        text,
        action: 'failed' as const,
        show: {
          intent: 'nudge' as const,
          bubble: {
            kind: 'thought' as const,
            text,
            tone: 'alert' as const,
            emphasis: 'high' as const,
            ttlMs: 22000
          },
          expression: { eyes: 'alert' as const, mouth: 'open' as const },
          animKey: 'alert' as const
        }
      },
      shouldRecordMemory: true
    }
  }

  if (event.status === 'running' || event.kind === 'task-start') {
    return {
      reply: {
        text,
        action: 'thinking' as const,
        show: {
          intent: 'companionship' as const,
          bubble: {
            kind: 'speech' as const,
            text,
            tone: 'soft' as const,
            ttlMs: 4200
          },
          expression: { eyes: 'soft' as const, mouth: 'open' as const },
          animKey: 'nudge' as const
        }
      },
      persistent: false,
      shouldRecordMemory: false
    }
  }

  if (event.kind === 'task-done' && event.status === 'succeeded') {
    return {
      reply: {
        text,
        action: 'celebrating' as const,
        show: {
          intent: 'celebrate' as const,
          bubble: {
            kind: 'speech' as const,
            text,
            tone: 'playful' as const,
            emphasis: 'high' as const,
            ttlMs: 20000
          },
          expression: { eyes: 'smile' as const, mouth: 'smile' as const },
          animKey: 'bounce' as const
        }
      },
      persistent: false,
      shouldRecordMemory: true
    }
  }

  return {
    reply: {
      text,
      action: 'celebrating' as const,
      show: {
        intent: 'celebrate' as const,
        bubble: {
          kind: 'speech' as const,
          text,
          tone: 'warm' as const,
          ttlMs: 5200
        },
        expression: { eyes: 'smile' as const, mouth: 'smile' as const },
        animKey: 'bounce' as const
      }
    },
    persistent: false,
    shouldRecordMemory: true
  }
}

const shouldMuteCodingEvent = (pet: PetData, event: PetCodingEvent) => {
  if (pet.ui.system.vacationMode || pet.ui.system.bossModeEnabled) {
    return event.status === 'running'
  }

  return false
}

const createCodingEvent = (overrides?: Partial<PetCodingEvent>): PetCodingEvent => ({
  id: 'event-1',
  kind: 'task-done',
  source: 'claude-code',
  title: '实现完成',
  summary: '这个任务已经收尾啦。',
  status: 'succeeded',
  createdAt: '2026-04-28T12:00:00.000Z',
  metadata: { branch: 'main' },
  ...overrides
})

const shouldPersistCodingEventMemory = (event: PetCodingEvent, pet: PetData) => {
  if (pet.ui.system.vacationMode || pet.ui.system.bossModeEnabled) {
    return event.status !== 'running'
  }

  return event.status !== 'running' && event.kind !== 'task-start'
}

const shouldPersistCodingEventAudit = (event: PetCodingEvent, pet: PetData) => {
  if (pet.ui.system.vacationMode || pet.ui.system.bossModeEnabled) {
    return event.status !== 'running'
  }

  return true
}

const createCodingAuditSummary = (event: PetCodingEvent) => `${getCodingEventStatusText(event)}：${getCodingEventPrimaryText(event)}`

const shouldScheduleIdle = (windowLabel?: string) => windowLabel === 'pet'

describe('coding event reaction mapping', () => {
  it('maps commit events to celebrate presentation', () => {
    const presentation = toCodingEventPresentation(createCodingEvent({ kind: 'commit-created', title: '已创建 commit', status: 'succeeded' }))

    expect(presentation.reply.action).toBe('celebrating')
    expect(presentation.reply.show?.intent).toBe('celebrate')
    expect(presentation.reply.show?.animKey).toBe('bounce')
    expect(presentation.shouldRecordMemory).toBe(true)
  })

  it('maps failed events to alert presentation', () => {
    const presentation = toCodingEventPresentation(createCodingEvent({ kind: 'test-fail', status: 'failed', summary: '有 2 个测试挂了。' }))

    expect(presentation.reply.action).toBe('failed')
    expect(presentation.reply.show?.intent).toBe('nudge')
    expect(presentation.reply.show?.bubble.tone).toBe('alert')
    expect(presentation.reply.text).toBe('【Claude Code｜需要你操作】\n有 2 个测试挂了。')
    expect(presentation.reply.show?.bubble.ttlMs).toBe(22000)
    expect(presentation.shouldRecordMemory).toBe(true)
  })

  it('maps running events to low-disruption presentation', () => {
    const presentation = toCodingEventPresentation(createCodingEvent({ kind: 'task-start', status: 'running', summary: '我开始处理这个任务了。' }))

    expect(presentation.reply.action).toBe('thinking')
    expect(presentation.reply.show?.intent).toBe('companionship')
    expect(presentation.reply.text).toBe('【Claude Code｜正在处理】\n我开始处理这个任务了。')
    expect(presentation.shouldRecordMemory).toBe(false)
  })

  it('maps Claude Code task completion to an automatic celebration reminder', () => {
    const presentation = toCodingEventPresentation(createCodingEvent({
      source: 'claude-code',
      kind: 'task-done',
      status: 'succeeded',
      summary: '任务：修复鼠标移出后对话框常驻。需要你：不用操作，已完成。',
      metadata: { taskName: '修复鼠标移出后对话框常驻' }
    }))

    expect(presentation.reply.text).toBe('【Claude Code｜完成了任务】\n任务：修复鼠标移出后对话框常驻')
    expect(presentation.reply.action).toBe('celebrating')
    expect(presentation.reply.show?.intent).toBe('celebrate')
    expect(presentation.reply.show?.bubble).toMatchObject({
      kind: 'speech',
      text: '【Claude Code｜完成了任务】\n任务：修复鼠标移出后对话框常驻',
      tone: 'playful',
      emphasis: 'high',
      ttlMs: 20000
    })
    expect(presentation.reply.show?.expression).toEqual({ eyes: 'smile', mouth: 'smile' })
    expect(presentation.reply.show?.animKey).toBe('bounce')
    expect(presentation.persistent).toBe(false)
    expect(presentation.shouldRecordMemory).toBe(true)
  })

  it('does not show generic Claude Code completion copy when task metadata exists', () => {
    const presentation = toCodingEventPresentation(createCodingEvent({
      source: 'claude-code',
      kind: 'task-done',
      status: 'succeeded',
      title: 'Claude Code 任务完成',
      summary: 'Agent has stopped — your input is ready.',
      metadata: { taskName: '检查布局并隐藏多余气泡' }
    }))

    expect(presentation.reply.text).toBe('【Claude Code｜完成了任务】\n任务：检查布局并隐藏多余气泡')
  })

  it('falls back to the title instead of generic Claude Code summary copy', () => {
    const presentation = toCodingEventPresentation(createCodingEvent({
      source: 'claude-code',
      kind: 'task-done',
      status: 'succeeded',
      title: '修复提醒文案',
      summary: 'Claude Code 已完成一个任务。'
    }))

    expect(presentation.reply.text).toBe('【Claude Code｜完成了任务】\n修复提醒文案')
  })

  it('keeps source tags for first-class producer values', () => {
    const pet = createDefaultPet()
    const memory = createCodingEventMemory(createCodingEvent({ source: 'codex', kind: 'task-done', title: 'Codex 完成任务' }), 'happy', pet.state.loneliness, pet.memory.working.currentScene)

    expect(memory.tags).toContain('codex')
    expect(memory.tags).not.toContain('manual')
  })

  it('supports vscode as a first-class producer source', () => {
    const presentation = toCodingEventPresentation(createCodingEvent({ source: 'vscode', kind: 'test-fail', status: 'failed', summary: 'VS Code 任务失败。' }))

    expect(presentation.reply.action).toBe('failed')
    expect(presentation.reply.show?.bubble.text).toBe('【VS Code｜需要你操作】\nVS Code 任务失败。')
  })

  it('supports cursor as a first-class producer source', () => {
    const pet = createDefaultPet()
    const event = createCodingEvent({ source: 'cursor', kind: 'task-done', status: 'succeeded', summary: 'Cursor 完成任务。' })
    const presentation = toCodingEventPresentation(event)
    const memory = createCodingEventMemory(event, presentation.reply.action, pet.state.loneliness, pet.memory.working.currentScene)

    expect(presentation.reply.action).toBe('celebrating')
    expect(presentation.reply.show?.bubble.text).toBe('【Cursor｜完成了任务】\nCursor 完成任务。')
    expect(memory.tags).toContain('cursor')
    expect(memory.tags).toContain('succeeded')
  })

  it('builds event memory for important coding activity', () => {
    const pet = createDefaultPet()
    const memory = createCodingEventMemory(createCodingEvent({ kind: 'commit-created', title: '提交完成' }), 'happy', pet.state.loneliness, pet.memory.working.currentScene)

    expect(memory.type).toBe('commit-created')
    expect(memory.importance).toBe(3)
    expect(memory.tags).toContain('claude-code')
    expect(memory.tags).toContain('succeeded')
    expect(memory.tags).toContain(pet.memory.working.currentScene)
  })

  it('summarizes audit entries with explicit coding status', () => {
    expect(createCodingAuditSummary(createCodingEvent({ kind: 'task-done', status: 'succeeded', summary: '任务：整理面板。需要你：不用操作，已完成。' }))).toBe('完成了任务：任务：整理面板')
    expect(createCodingAuditSummary(createCodingEvent({ kind: 'task-failed', status: 'failed', summary: '需要确认 shell 命令。' }))).toBe('需要你操作：需要确认 shell 命令。')
    expect(createCodingAuditSummary(createCodingEvent({ kind: 'task-start', status: 'running', summary: '开始检查测试。' }))).toBe('正在处理：开始检查测试。')
  })

  it('persists failed events during muted system modes', () => {
    const pet = createDefaultPet()
    pet.ui.system.bossModeEnabled = true

    expect(shouldPersistCodingEventMemory(createCodingEvent({ kind: 'test-fail', status: 'failed' }), pet)).toBe(true)
    expect(shouldPersistCodingEventAudit(createCodingEvent({ kind: 'test-fail', status: 'failed' }), pet)).toBe(true)
  })

  it('skips running-event persistence during muted system modes', () => {
    const pet = createDefaultPet()
    pet.ui.system.vacationMode = true

    expect(shouldPersistCodingEventMemory(createCodingEvent({ kind: 'task-start', status: 'running' }), pet)).toBe(false)
    expect(shouldPersistCodingEventAudit(createCodingEvent({ kind: 'task-start', status: 'running' }), pet)).toBe(false)
  })

  it('mutes running events during vacation mode', () => {
    const pet = createDefaultPet()
    pet.ui.system.vacationMode = true

    expect(shouldMuteCodingEvent(pet, createCodingEvent({ status: 'running', kind: 'task-start' }))).toBe(true)
    expect(shouldMuteCodingEvent(pet, createCodingEvent({ status: 'failed', kind: 'test-fail' }))).toBe(false)
  })

  it('only schedules idle ticks for the pet window', () => {
    expect(shouldScheduleIdle('pet')).toBe(true)
    expect(shouldScheduleIdle('panel')).toBe(false)
    expect(shouldScheduleIdle(undefined)).toBe(false)
  })
})
