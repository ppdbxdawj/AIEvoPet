import { describe, expect, it } from 'vitest'
import {
  CODING_REMINDER_QUEUE_LIMIT,
  CODING_REMINDER_QUEUE_WINDOW_MS,
  formatCodingReminderQueueText,
  isQueueableCodingReminder,
  updateCodingReminderQueue
} from './coding-reminder-queue'
import type { PetCodingEvent } from '../types/pet'

const createEvent = (overrides: Partial<PetCodingEvent>): PetCodingEvent => ({
  id: 'event-1',
  kind: 'task-done',
  source: 'cursor',
  title: 'Cursor 任务完成',
  status: 'succeeded',
  createdAt: '2026-05-06T00:00:00.000Z',
  ...overrides
})

describe('coding reminder queue', () => {
  it('queues completed and failed task reminders but not running events', () => {
    expect(isQueueableCodingReminder(createEvent({ kind: 'task-done', status: 'succeeded' }))).toBe(true)
    expect(isQueueableCodingReminder(createEvent({ kind: 'task-failed', status: 'failed' }))).toBe(true)
    expect(isQueueableCodingReminder(createEvent({ kind: 'task-start', status: 'running' }))).toBe(false)
  })

  it('keeps the latest Cursor completion visible when a Claude attention reminder arrives', () => {
    const current = updateCodingReminderQueue({
      current: [],
      next: {
        id: 'cursor-done',
        text: '【Cursor｜完成了任务】\n任务：整理 ETL 方案',
        createdAtMs: 1_000
      },
      nowMs: 1_000
    })

    const next = updateCodingReminderQueue({
      current,
      next: {
        id: 'claude-attention',
        text: '【Claude Code｜需要你操作】\n任务：Claude Code 正在等待授权。需要你：确认 Bash',
        createdAtMs: 1_500
      },
      nowMs: 1_500
    })

    expect(formatCodingReminderQueueText(next)).toBe([
      '【Claude Code｜需要你操作】\n任务：Claude Code 正在等待授权。需要你：确认 Bash',
      '',
      '刚刚还有：',
      '- 【Cursor｜完成了任务】 任务：整理 ETL 方案'
    ].join('\n'))
  })

  it('drops stale and excess reminders', () => {
    const current = Array.from({ length: CODING_REMINDER_QUEUE_LIMIT + 2 }, (_, index) => ({
      id: `old-${index}`,
      text: `old ${index}`,
      createdAtMs: index === 0 ? 1_000 : 40_000 + index
    }))

    const next = updateCodingReminderQueue({
      current,
      next: {
        id: 'latest',
        text: 'latest',
        createdAtMs: 42_000
      },
      nowMs: 42_000 + CODING_REMINDER_QUEUE_WINDOW_MS + 1
    })

    expect(next).toEqual([{ id: 'latest', text: 'latest', createdAtMs: 42_000 }])
  })
})
