import type { DomainStateEnvelope, DomainStateKey, DomainStateMap } from '../../types/domain'
import type { PetAgentToolCall } from './agent-types'

export interface ToolPolicyDecision {
  allowed: boolean
  requiresConfirmation: boolean
  reason?: string
}

const REQUIRES_CONFIRMATION = new Set<string>([
  'calendar.create',
  'calendar.update',
  'calendar.delete',
  'calendar.move',
  'calendar.provider:eventkit',
  'calendar.provider:ics',
  'system.capture',
  'system.gif',
  'mcp.call',
  'skill.run'
])

export const getToolConfirmationKey = (toolCall: PetAgentToolCall) => {
  if (toolCall.name === 'calendar.provider') {
    return `calendar.provider:${toolCall.input.provider}`
  }

  return toolCall.name
}

export const evaluateToolPolicy = (toolCall: PetAgentToolCall): ToolPolicyDecision => {
  const confirmationKey = getToolConfirmationKey(toolCall)

  if (toolCall.name.startsWith('calendar.') && toolCall.name !== 'calendar.provider') {
    return {
      allowed: true,
      requiresConfirmation: true,
      reason: 'calendar writes must stay user-confirmed'
    }
  }

  if (REQUIRES_CONFIRMATION.has(confirmationKey)) {
    return {
      allowed: true,
      requiresConfirmation: true,
      reason: confirmationKey.startsWith('calendar.provider') ? 'switching calendar providers must stay user-confirmed' : undefined
    }
  }

  return {
    allowed: true,
    requiresConfirmation: false
  }
}

export const markToolUsed = <T extends DomainStateKey>(
  toolsState: DomainStateEnvelope<DomainStateMap[T]>,
  toolName: string
): DomainStateEnvelope<DomainStateMap[T]> => {
  if (toolsState.data && typeof toolsState.data === 'object' && 'lastUsedAtByTool' in toolsState.data) {
    return {
      ...toolsState,
      updatedAt: new Date().toISOString(),
      data: {
        ...toolsState.data,
        lastUsedAtByTool: {
          ...(toolsState.data as DomainStateMap['tools']).lastUsedAtByTool,
          [toolName]: new Date().toISOString()
        }
      } as DomainStateMap[T]
    }
  }

  return toolsState
}
