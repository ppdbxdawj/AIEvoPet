import type { PetCodingEvent } from '../types/pet'

export interface CodingReminderQueueItem {
  id: string
  text: string
  createdAtMs: number
}

export const CODING_REMINDER_QUEUE_LIMIT = 3
export const CODING_REMINDER_QUEUE_WINDOW_MS = 30_000

export const isQueueableCodingReminder = (event: PetCodingEvent) => {
  if (event.kind === 'task-done' && event.status === 'succeeded') return true
  return event.status === 'failed' || event.kind === 'task-failed' || event.kind === 'test-fail' || event.kind === 'build-fail'
}

export const compactCodingReminderText = (text: string) => text
  .replace(/\s*\n\s*/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export const updateCodingReminderQueue = ({
  current,
  next,
  nowMs
}: {
  current: CodingReminderQueueItem[]
  next: CodingReminderQueueItem
  nowMs: number
}) => [
  next,
  ...current.filter((item) => item.id !== next.id && nowMs - item.createdAtMs <= CODING_REMINDER_QUEUE_WINDOW_MS)
].slice(0, CODING_REMINDER_QUEUE_LIMIT)

export const formatCodingReminderQueueText = (items: CodingReminderQueueItem[]) => {
  const [latest, ...previous] = items
  if (!latest) return ''
  if (previous.length === 0) return latest.text

  return `${latest.text}\n\n刚刚还有：\n${previous.map((item) => `- ${compactCodingReminderText(item.text)}`).join('\n')}`
}
