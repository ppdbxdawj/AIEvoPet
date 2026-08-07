import type { PetConversationLoopStep, PetSceneId } from '../../types/pet'
import type { PetAgentToolCall } from './agent-types'

export const normalizeAgentToolCalls = (steps: PetConversationLoopStep[]): PetAgentToolCall[] => {
  const toolCalls: PetAgentToolCall[] = []

  for (const step of steps.slice(0, 3)) {
    if (step.kind === 'memory-update') {
      toolCalls.push({
        name: 'memory.update',
        input: step.memoryUpdate
      })
      continue
    }

    if (step.kind === 'settings-update') {
      toolCalls.push({
        name: 'settings.update',
        input: step.settingsUpdate
      })
      continue
    }

    if (step.kind === 'record-fact') {
      toolCalls.push({
        name: 'fact.record',
        input: step.fact
      })
      continue
    }

    if (step.kind === 'interaction') {
      toolCalls.push({
        name: 'interaction.run',
        input: { interaction: step.interaction }
      })
      continue
    }

    if (step.kind === 'create-reminder') {
      toolCalls.push({
        name: 'reminder.create',
        input: step.reminder
      })
      continue
    }

    if (step.kind === 'set-scene-hint') {
      toolCalls.push({
        name: 'scene.hint',
        input: { sceneId: step.sceneId as PetSceneId }
      })
      continue
    }

    toolCalls.push({
      name: 'show.set-intent',
      input: { show: step.show }
    })
  }

  return toolCalls
}

export const readSceneHint = (toolCalls: PetAgentToolCall[]): PetSceneId | undefined => {
  const hinted = toolCalls.find((toolCall) => toolCall.name === 'scene.hint')
  return hinted?.name === 'scene.hint' ? hinted.input.sceneId : undefined
}
