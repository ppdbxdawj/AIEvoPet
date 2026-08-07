import { describe, expect, it } from 'vitest'
import { parsePetIntent } from './pet-intent'

describe('parsePetIntent settings detection', () => {
  it('maps Chinese palette descriptors to a settings intent', () => {
    const blue = parsePetIntent('帮我把面板换成蓝色')
    expect(blue).toEqual({ kind: 'settings', settings: { target: 'palette', value: 'blueberry-milk' } })

    const matcha = parsePetIntent('换个抹茶云配色吧')
    expect(matcha).toEqual({ kind: 'settings', settings: { target: 'palette', value: 'matcha-cloud' } })

    const dark = parsePetIntent('切换深色')
    expect(dark).toEqual({ kind: 'settings', settings: { target: 'palette', value: 'midnight-mocha' } })
  })

  it('does not paint the panel when the user is just expressing taste', () => {
    // "我喜欢蓝色" mentions a palette word but isn't a swap request -- it
    // should land in chat (and let memory.update record the like instead).
    const liking = parsePetIntent('我喜欢蓝色')
    expect(liking.kind).toBe('chat')
  })

  it('detects vacation / boss / nest mode toggles', () => {
    expect(parsePetIntent('我想进入安静陪伴一会')).toEqual({
      kind: 'settings',
      settings: { target: 'vacation-mode', value: 'on' }
    })
    expect(parsePetIntent('退出安静吧')).toEqual({
      kind: 'settings',
      settings: { target: 'vacation-mode', value: 'off' }
    })
    expect(parsePetIntent('老板来了')).toEqual({
      kind: 'settings',
      settings: { target: 'boss-mode', value: 'on' }
    })
    expect(parsePetIntent('窝模式')).toEqual({
      kind: 'settings',
      settings: { target: 'nest-mode', value: 'on' }
    })
  })

  it('detects strong-reminder requests including "改成强提醒" and "不要免打扰"', () => {
    expect(parsePetIntent('改成强提醒')).toEqual({
      kind: 'settings',
      settings: { target: 'strong-reminder', value: 'on' }
    })
    expect(parsePetIntent('强提醒')).toEqual({
      kind: 'settings',
      settings: { target: 'strong-reminder', value: 'on' }
    })
    expect(parsePetIntent('不要免打扰')).toEqual({
      kind: 'settings',
      settings: { target: 'strong-reminder', value: 'on' }
    })
    expect(parsePetIntent('关闭强提醒')).toEqual({
      kind: 'settings',
      settings: { target: 'strong-reminder', value: 'off' }
    })
  })

  it('parses pet renames without colliding with the user-name pattern', () => {
    const rename = parsePetIntent('叫你 棉花糖')
    expect(rename).toEqual({ kind: 'settings', settings: { target: 'pet-name', value: '棉花糖' } })

    // "叫我 X" still belongs to learnFromUserMessage (user's preferred name)
    // and must NOT trigger a pet rename. We assert the intent stays in chat.
    const userRename = parsePetIntent('以后叫我阿江')
    expect(userRename.kind).toBe('chat')
  })

  it('parses high-intensity scheduled reminders without stealing standalone strong-reminder settings', () => {
    const intent = parsePetIntent('10分钟后强提醒我喝水')
    expect(intent).toMatchObject({
      kind: 'reminder',
      reminder: { title: '喝水', intensity: 'high' }
    })

    expect(parsePetIntent('强提醒')).toEqual({
      kind: 'settings',
      settings: { target: 'strong-reminder', value: 'on' }
    })
  })

  it('parses low and default reminder intensities', () => {
    expect(parsePetIntent('5分钟后轻轻提醒我休息')).toMatchObject({
      kind: 'reminder',
      reminder: { title: '休息', intensity: 'low' }
    })
    expect(parsePetIntent('5 分钟后提醒我喝水')).toMatchObject({
      kind: 'reminder',
      reminder: { title: '喝水', intensity: 'medium' }
    })
  })

  it('still supports the legacy interaction commands', () => {
    expect(parsePetIntent('过来让我摸摸').kind).toBe('interaction')
    expect(parsePetIntent('5 分钟后提醒我喝水').kind).toBe('reminder')
  })
})
