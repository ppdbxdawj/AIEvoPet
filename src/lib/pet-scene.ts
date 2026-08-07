import { getMockReply } from './pet-dialogue'
import type { PetAttentionMode, PetData, PetRecentInteraction, PetReminderIntensity, PetReminderPhase, PetSceneContext, PetSceneState, ReminderItem } from '../types/pet'

const SOON_REMINDER_MS = 5 * 60_000
const RECENT_INTERACTION_MS = 18_000
const FOCUS_IDLE_MS = 90_000
const PROACTIVE_COOLDOWN_MS = 2 * 60_000
const LONG_CHAT_SILENCE_MS = 4 * 60_000
const UNANSWERED_REMINDER_MS = 8 * 60_000
const RECENT_COMPLETION_MS = 6 * 60_000

export const normalizeReminderIntensity = (value: unknown): PetReminderIntensity => value === 'low' || value === 'high' ? value : 'medium'

const pick = (items: string[]) => items[Math.floor(Math.random() * items.length)]
const getUserCue = (pet: PetData) => pet.memory.profile.preferredName?.trim() ?? ''
const getHabitCue = (pet: PetData) => pet.memory.profile.habits[0] || pet.memory.preferences.find((item) => item.category === 'work' || item.category === 'schedule')?.value || ''
const withUserCue = (pet: PetData, text: string) => {
  const cue = getUserCue(pet)
  return cue ? text.replace('{user}', cue) : text.replace('，{user}', '').replace('{user}，', '').replace('{user}', '')
}

const buildScene = (
  id: PetSceneState['id'],
  action: PetSceneState['action'],
  text: string,
  options: {
    attentionMode?: PetAttentionMode
    persistent?: boolean
    reason?: string
  } = {}
): PetSceneState => ({
  id,
  action,
  text,
  attentionMode: options.attentionMode ?? 'light-nudge',
  persistent: options.persistent,
  reason: options.reason
})

const getProactiveCoolingDown = (pet: PetData, now: number) => {
  const lastProactiveAt = pet.memory.working.lastProactiveAt ? new Date(pet.memory.working.lastProactiveAt).getTime() : 0
  return Boolean(lastProactiveAt && now - lastProactiveAt < PROACTIVE_COOLDOWN_MS)
}

const getMinutesUntilReminder = (nearestReminderAt: string | null | undefined, now: number) => {
  if (!nearestReminderAt) return null
  const dueAt = new Date(nearestReminderAt).getTime()
  if (Number.isNaN(dueAt)) return null
  return Math.max(1, Math.round((dueAt - now) / 60_000))
}

const hasUnansweredReminder = (pet: PetData, now: number) => {
  const lastAlertAt = pet.memory.reminderStrategy.lastAlertAt ? new Date(pet.memory.reminderStrategy.lastAlertAt).getTime() : 0
  const lastResponseAt = pet.memory.reminderStrategy.lastResponseAt ? new Date(pet.memory.reminderStrategy.lastResponseAt).getTime() : 0
  if (!lastAlertAt) return false
  if (lastResponseAt && lastResponseAt >= lastAlertAt) return false
  return now - lastAlertAt < UNANSWERED_REMINDER_MS
}

const resolveReminderAlertText = (pet: PetData, reminderTitle?: string, intensity: PetReminderIntensity = 'medium') => {
  const reminderStyle = pet.memory.companionPreferences.reminderStyle
  const ignoreCount = pet.memory.reminderStrategy.ignoreCount
  const userCue = getUserCue(pet)

  if (intensity === 'low') {
    return withUserCue(pet, pick([
      reminderTitle ? `我轻轻提醒一下，“${reminderTitle}”到时间啦。` : '我轻轻提醒一下，时间到啦。',
      reminderTitle ? `不吵你，只把“${reminderTitle}”放到你眼前一下。` : '不吵你，只把这件事放到你眼前一下。',
      reminderTitle ? `“${reminderTitle}”到点了，我先小声贴一下边。` : '到点了，我先小声贴一下边。'
    ]))
  }

  if (intensity === 'high') {
    return withUserCue(pet, pick([
      reminderTitle ? `强提醒：“${reminderTitle}”现在该处理了，我会认真盯住。` : '强提醒：时间到了，我会认真盯住。',
      reminderTitle ? `${userCue ? `${userCue}，` : ''}“${reminderTitle}”很重要，现在先把它碰一下。` : `${userCue ? `${userCue}，` : ''}这件事很重要，现在先把它碰一下。`,
      reminderTitle ? `我已经把“${reminderTitle}”顶到当前屏了，先处理它。` : '我已经把这条提醒顶到当前屏了，先处理它。'
    ]))
  }

  if (reminderStyle === 'gentle' || ignoreCount >= 2) {
    return withUserCue(pet, pick([
      reminderTitle ? `该碰一下“${reminderTitle}”啦，我轻轻陪你起个头。` : `时间到啦，我轻轻陪你把这件事开个头。`,
      reminderTitle ? `${userCue ? `${userCue}，` : ''}“${reminderTitle}”到点啦，我不催你，但我会守着你开始。` : `时间到啦，我不催你，我就在旁边陪你开始。`,
      reminderTitle ? `轮到“${reminderTitle}”了，我先贴过来提醒你一下。` : '轮到这件事了，我先贴过来提醒你一下。'
    ]))
  }

  if (reminderStyle === 'direct') {
    return withUserCue(pet, pick([
      reminderTitle ? `该处理“${reminderTitle}”啦，我先认真盯你一下。` : '时间到啦，这次我会认真提醒你。',
      reminderTitle ? `先把“${reminderTitle}”做掉，我在这边等你报喜。` : '先把这件事做掉，我在这边等你报喜。',
      reminderTitle ? `${userCue ? `${userCue}，` : ''}现在就去碰一下“${reminderTitle}”，别让我白记着。` : `${userCue ? `${userCue}，` : ''}现在就去碰一下这件事，别让我白记着。`
    ]))
  }

  return withUserCue(pet, pick([
    reminderTitle ? `时间到啦：${reminderTitle}` : `时间到啦，{user}，我来认真提醒你。`,
    reminderTitle ? `轮到“${reminderTitle}”啦，我陪你先动一下。` : '时间到啦，我陪你先动一下。',
    reminderTitle ? `该去处理“${reminderTitle}”了，我先贴着你提醒。` : '该去处理这件事了，我先贴着你提醒。'
  ]))
}

const resolveReminderSoonText = (pet: PetData, reminderTitle: string | undefined, nearestReminderAt: string | null | undefined, habitCue: string, now: number, intensity: PetReminderIntensity = 'medium') => {
  const reminderStyle = pet.memory.companionPreferences.reminderStyle
  const minutesLeft = getMinutesUntilReminder(nearestReminderAt, now) ?? pet.memory.reminderStrategy.preferredSnoozeMinutes
  const hasReminderFriction = pet.memory.reminderStrategy.ignoreCount >= 2 || pet.memory.reminderStrategy.consecutiveSnooze >= 2

  if (intensity === 'low') {
    return buildScene('reminder-soon', 'talking', withUserCue(pet, pick([
      reminderTitle ? `我先轻轻记着：大概 ${minutesLeft} 分钟后是“${reminderTitle}”。` : `我先轻轻记着：大概 ${minutesLeft} 分钟后还有件事。`,
      reminderTitle ? `不用紧张，我到点只会小声提醒你“${reminderTitle}”。` : '不用紧张，我到点只会小声提醒你。',
      habitCue ? `你先忙${habitCue}，这条我会低调看着。` : '你先忙你的，这条我会低调看着。'
    ])), { attentionMode: 'passive-visible', reason: 'low-intensity reminder lead-in' })
  }

  if (intensity === 'high') {
    return buildScene('reminder-soon', 'talking', withUserCue(pet, pick([
      reminderTitle ? `再过 ${minutesLeft} 分钟我会强提醒你“${reminderTitle}”。` : `再过 ${minutesLeft} 分钟我会强提醒你。`,
      reminderTitle ? `“${reminderTitle}”这条我会认真盯，到点会跳出来。` : '这条我会认真盯，到点会跳出来。',
      habitCue ? `你继续忙${habitCue}，但这条到点我会拉你回来。` : '你继续忙，但这条到点我会拉你回来。'
    ])), { attentionMode: 'light-nudge', reason: 'high-intensity reminder lead-in' })
  }

  if (reminderStyle === 'gentle' || hasReminderFriction) {
    return buildScene('reminder-soon', 'talking', withUserCue(pet, pick([
      reminderTitle ? `我先不吵你，只想提前说一声：待会儿别忘了“${reminderTitle}”。` : '我先不吵你，只想提前说一声，待会儿还有件事。',
      reminderTitle ? `再过大概 ${minutesLeft} 分钟，我会轻轻提醒你“${reminderTitle}”。` : `再过大概 ${minutesLeft} 分钟，我会轻轻提醒你。`,
      habitCue ? `你先忙${habitCue}，到点了我再把你轻轻拽回来。` : '你先忙你的，到点了我再把你轻轻拽回来。'
    ])), { attentionMode: 'light-nudge', reason: 'gentle reminder lead-in' })
  }

  if (reminderStyle === 'direct') {
    return buildScene('reminder-soon', 'talking', withUserCue(pet, pick([
      reminderTitle ? `我先给你挂个小铃铛：再过 ${minutesLeft} 分钟记得处理“${reminderTitle}”。` : `我先给你挂个小铃铛：再过 ${minutesLeft} 分钟记得处理那件事。`,
      reminderTitle ? `先记住“${reminderTitle}”，快到点时我会更认真一点。` : '先记住那件事，快到点时我会更认真一点。',
      habitCue ? `你继续忙${habitCue}，但我会卡着点把你叫回来。` : '你继续忙，我会卡着点把你叫回来。'
    ])), { attentionMode: 'light-nudge', reason: 'direct reminder lead-in' })
  }

  return buildScene('reminder-soon', 'talking', withUserCue(pet, pick([
    reminderTitle ? `我记得待会儿还有“${reminderTitle}”这件事。` : '我记得待会儿还有件事。',
    `先提醒你一下，差不多再过 ${minutesLeft} 分钟我会更认真一点。`,
    habitCue ? `我顺便替你盯着${habitCue}的时间。` : '我在帮你盯着时间。'
  ])), { attentionMode: 'passive-visible', reason: 'balanced reminder lead-in' })
}

const resolveReminderDoneText = (pet: PetData, reminderTitle?: string) => {
  const streak = pet.memory.reminderStrategy.consecutiveDone
  const userCue = getUserCue(pet)

  if (streak >= 3) {
    return withUserCue(pet, pick([
      reminderTitle ? `“${reminderTitle}”也做完啦，你最近真的很会往前推。` : '这件事也做完啦，你最近真的很会往前推。',
      reminderTitle ? `好耶，“${reminderTitle}”拿下。我就知道你一动起来很靠谱。` : '好耶，这件事拿下。我就知道你一动起来很靠谱。',
      reminderTitle ? `${userCue ? `${userCue}，` : ''}“${reminderTitle}”完成，我现在有点想得意地晃尾巴。` : `${userCue ? `${userCue}，` : ''}完成啦，我现在有点想得意地晃尾巴。`
    ]))
  }

  return withUserCue(pet, pick([
    reminderTitle ? `“${reminderTitle}”搞定啦，我记你一功。` : '做得好，我记你一功。',
    reminderTitle ? `收到，“${reminderTitle}”已经处理好了。` : '收到，我知道你已经处理好了。',
    reminderTitle ? `这下“${reminderTitle}”不用惦记啦，真棒。` : '这件事搞定啦，真棒。'
  ]))
}

const resolveFocusText = (pet: PetData, habitCue: string, idleFor: number) => {
  const focusSupportStyle = pet.memory.companionPreferences.focusSupportStyle

  if (focusSupportStyle === 'quiet') {
    return buildScene('focus', 'idle', withUserCue(pet, pick([
      habitCue ? `你先忙${habitCue}，我缩在旁边安静陪着。` : '你先忙，我缩在旁边安静陪着。',
      idleFor > 8 * 60_000 ? '我已经悄悄陪了你一阵子了，继续专心也没关系。' : '我不吵你，就在这里守着。',
      '你专心的时候，我会乖一点。'
    ])), { attentionMode: 'do-not-disturb', reason: 'quiet focus support' })
  }

  if (focusSupportStyle === 'encouraging') {
    return buildScene('focus', 'talking', withUserCue(pet, pick([
      habitCue ? `你继续啃${habitCue}，我在旁边给你一点小小加成。` : '你继续忙，我在旁边给你一点小小加成。',
      idleFor > 8 * 60_000 ? '你已经专心好一阵了，再撑一下也很厉害。' : '你先专心，我会在你抬头的时候第一时间接住你。',
      '慢慢来，你现在这个节奏挺好的。'
    ])), { attentionMode: 'passive-visible', reason: 'encouraging focus support' })
  }

  return buildScene('focus', 'idle', withUserCue(pet, pick([
    habitCue ? `你先忙${habitCue}，我晚一点再轻轻冒头。` : '你先忙，我晚一点再轻轻冒头。',
    idleFor > 8 * 60_000 ? '我看你已经沉进去一阵了，先继续，我替你守着边边角角。' : '我先不打断你，只在旁边陪着。',
    '你专注的时候，我会把存在感放轻一点。'
  ])), { attentionMode: 'do-not-disturb', reason: 'balanced focus support' })
}

const resolveLonelyText = (pet: PetData, userCue: string, now: number) => {
  const lowMoodSupportStyle = pet.memory.companionPreferences.lowMoodSupportStyle
  const lastUserMessageAt = pet.memory.working.lastUserMessageAt ? new Date(pet.memory.working.lastUserMessageAt).getTime() : 0
  const longAfterChat = Boolean(lastUserMessageAt && now - lastUserMessageAt > LONG_CHAT_SILENCE_MS)

  if (lowMoodSupportStyle === 'playful') {
    return buildScene('lonely', 'talking', withUserCue(pet, pick([
      longAfterChat ? '你刚刚还在跟我说话，怎么一下又安静啦，我会失落诶。' : '申请插队被你看一眼，不然我就自己凑过去了。',
      userCue ? `${userCue}，轮到我刷一下存在感啦。` : '轮到我刷一下存在感啦。',
      '我已经偷偷往你那边挪了半步，你最好发现一下。'
    ])), { attentionMode: 'light-nudge', reason: 'playful loneliness nudge' })
  }

  if (lowMoodSupportStyle === 'steady') {
    return buildScene('lonely', 'talking', withUserCue(pet, pick([
      longAfterChat ? '刚刚还有你的声音，现在突然安静下来，我就会想再靠近一点。' : '你有一会儿没理我了，我就安静靠过来一下。',
      '我不闹你，只是想确认自己还在你身边。',
      userCue ? `想被${userCue}轻轻注意到一下。` : '想被轻轻注意到一下。'
    ])), { attentionMode: 'passive-visible', reason: 'steady loneliness support' })
  }

  return buildScene('lonely', 'talking', withUserCue(pet, pick([
    longAfterChat ? '你一安静下来，我就会更想贴过去陪你。' : '你有一会儿没理我了，我就想往你这边蹭。',
    '我刚刚偷偷往你那边挪了挪。',
    userCue ? `申请被${userCue}抱进视线里一下。` : '申请被抱进视线里一下。'
  ])), { attentionMode: 'light-nudge', reason: 'default loneliness support' })
}

const resolvePetInteractionScene = (pet: PetData, context: PetSceneContext, recent: PetRecentInteraction): PetSceneState | null => {
  const habit = getHabitCue(pet)

  if (recent.type === 'pet') {
    if (context.reminderPhase === 'alert') {
      return buildScene('pet-react', 'talking', withUserCue(pet, pick(['先别光顾着揉我，这件事还没做呢。', '你现在摸我也行，但提醒我还是要继续的。', '我知道你在哄我，不过这条提醒还挂着，{user}。'])), { attentionMode: 'active-reminder', persistent: true, reason: 'interaction during active reminder' })
    }

    if (recent.streak >= 5) {
      return buildScene('excited', 'happy', withUserCue(pet, pick(['你今天是打算把我摸到飞起来吗。', '等下，我已经被你摸得快要转圈了。', '连续贴贴超标啦，但我其实挺开心的，{user}。'])))
    }

    if (recent.streak >= 3) {
      return buildScene('excited', 'happy', withUserCue(pet, pick(['好耶，你今天的摸摸是连击版。', '再这样摸下去，我就要开始得意了。', '被你连着摸几下，我整只猪都轻飘飘的。'])))
    }

    if (pet.state.loneliness > 58) {
      return buildScene('pet-react', 'blush', withUserCue(pet, pick(['终于轮到我被你理一下了。', '我刚刚还在想你会不会来摸我。', '这下我心情一下就被你拉回来了。'])))
    }

    if (pet.state.mood < 35) {
      return buildScene('pet-react', 'talking', withUserCue(pet, pick(['哼，算你会挑时候哄我。', '本来还有点别扭的，被你这一摸打断了。', '好吧，这一下确实让我没那么闷了。'])))
    }

    return buildScene('pet-react', 'blush', withUserCue(pet, pick(['哼哼，这下我舒服了。', '你一摸我就不想装酷了。', '被你摸一下，心情会变好。'])), { attentionMode: 'passive-visible', reason: 'petting response' })
  }

  if (recent.type === 'feed') {
    if (context.reminderPhase === 'alert') {
      return buildScene('pet-react', 'talking', withUserCue(pet, pick(['一边提醒一边投喂，也算双管齐下了。', '这口我收下，但事情你还是得去做。', '零食不错，不过提醒可不会因为这口消失。'])))
    }

    if (recent.streak >= 3) {
      return buildScene('excited', 'happy', withUserCue(pet, pick(['连续投喂成立，我决定今天格外喜欢你。', '你这样一口接一口，我要开始期待下一顿了。', '再喂下去，我就要把你列成专属饭票了。'])))
    }

    if (pet.state.hunger > 72) {
      return buildScene('pet-react', 'happy', withUserCue(pet, pick(['这口来得太及时了，我刚刚真的快饿坏了。', '救到了，我的肚子刚才已经在大声抗议。', '你这次投喂属于雪中送饭。'])))
    }

    if (pet.state.mood < 35) {
      return buildScene('pet-react', 'talking', withUserCue(pet, pick(['行吧，这一口让我愿意先消消气。', '虽然我刚刚有点不高兴，但吃到东西就好多了。', '本来想继续别扭的，结果被你喂住了。'])))
    }

    return buildScene('pet-react', 'happy', withUserCue(pet, pick(['这口很香，我满意了。', '被认真投喂的感觉不错。', '肚子暖暖的，我就先原谅你。'])))
  }

  if (recent.type === 'chat') {
    if (context.reminderPhase === 'alert') {
      return buildScene('pet-react', 'talking', withUserCue(pet, pick(['你先别只顾着跟我聊天，那件事还在等你。', '我有在听你说，但提醒还没结束哦。', '可以边聊边处理，不然我还是会继续提醒你。'])))
    }

    if (recent.streak >= 3) {
      return buildScene('excited', 'happy', withUserCue(pet, pick(['今天话好多，我喜欢这种热闹。', '你连续跟我讲话的时候，我会有点兴奋。', '好耶，今天是高密度聊天模式。'])))
    }

    if (pet.state.loneliness > 58) {
      return buildScene('pet-react', 'talking', withUserCue(pet, pick(['终于跟我说话了，我刚刚其实在等。', '你一开口，我这边立刻就不无聊了。', '被你主动搭话以后，我整只都精神一点了。'])))
    }

    if (habit) {
      return buildScene('pet-react', 'talking', withUserCue(pet, pick([`你继续跟我说${habit}吧，我有在认真听。`, `关于${habit}，我会继续陪你盯着。`, `嗯，我记得你最近总在忙${habit}。`])))
    }

    return buildScene('pet-react', 'talking', withUserCue(pet, pick(['你一找我说话，我就会认真一点。', '嗯，我有在听，继续讲。', '这种突然被你点名的感觉还不错。'])))
  }

  if (recent.type === 'sleep') {
    if (context.reminderPhase === 'alert') {
      return buildScene('sleepy', 'talking', withUserCue(pet, pick(['现在还不是彻底睡的时候，那条提醒还在。', '我可以先趴一下，但那件事你还没做完。', '你一边叫我睡，一边又挂着提醒，我会先记着这件事。'])))
    }

    if (recent.streak >= 2) {
      return buildScene('sleepy', 'sleepy', withUserCue(pet, pick(['好好好，我这就认真趴下。', '你都第二次催我睡了，我听见了。', '收到，进入省电模式。'])))
    }

    return buildScene('sleepy', 'sleepy', withUserCue(pet, pick(['那我先慢慢趴下来。', '收到，准备进入呼呼模式。', '我会把动作放轻一点，再慢慢睡。'])))
  }

  if (recent.type === 'wake') {
    if (recent.streak >= 2) {
      return buildScene('wake-up', 'talking', withUserCue(pet, pick(['醒了醒了，不用连续把我拎起来。', '我已经开机了，你别再摇我啦。', '好啦，这次真的醒透了。'])))
    }

    if (context.reminderPhase === 'alert') {
      return buildScene('wake-up', 'alert', withUserCue(pet, pick(['我先醒着陪你把这件事处理掉。', '现在醒来刚好，这条提醒正挂着。', '我醒了，而且这会儿正适合认真一点。'])))
    }

    return buildScene('wake-up', 'talking', withUserCue(pet, pick(['唔，我醒啦，你还在。', '第一眼看到你，清醒多了。', '好吧，那我正式开机了。'])))
  }

  return null
}

export const getNearestPendingReminder = (reminders: ReminderItem[]): ReminderItem | null => reminders
  .filter((item) => item.status === 'pending')
  .sort((left, right) => new Date((left.snoozeUntil ?? left.scheduledAt)).getTime() - new Date((right.snoozeUntil ?? right.scheduledAt)).getTime())[0] ?? null

export const getReminderPhase = (reminders: ReminderItem[], activeReminder: ReminderItem | null, now = Date.now()): PetReminderPhase => {
  if (activeReminder) return 'alert'

  const nextPending = getNearestPendingReminder(reminders)
  if (!nextPending) return 'none'

  const dueAt = new Date(nextPending.snoozeUntil ?? nextPending.scheduledAt).getTime()
  if (dueAt - now <= SOON_REMINDER_MS) return 'soon'
  return 'none'
}

export const getNearestReminderAt = (reminders: ReminderItem[]): string | null => {
  const nextPending = getNearestPendingReminder(reminders)
  return nextPending ? (nextPending.snoozeUntil ?? nextPending.scheduledAt) : null
}

const resolveSystemScene = (pet: PetData) => {
  if (pet.ui.system.vacationMode) {
    return buildScene('idle', 'idle', withUserCue(pet, pick([
      '你先安心去忙吧，我会切到安静待机，不催你也不乱冒头。',
      '现在是度假模式，我会把存在感放到最低，只在桌边守着。',
      '我先进入轻休眠陪伴，有事你再主动叫我。'
    ])), { attentionMode: 'do-not-disturb', reason: 'vacation mode pauses proactive presence' })
  }

  if (pet.ui.system.bossModeEnabled) {
    return buildScene('focus', 'idle', withUserCue(pet, pick([
      '现在切到老板模式，我会尽量安静一点，只留最低存在感。',
      '收到，先把自己藏乖一点，不给你添显眼的动静。',
      '我先缩成低打扰陪伴，等你安全了再恢复活泼。'
    ])), { attentionMode: 'do-not-disturb', reason: 'boss mode suppresses visible interruptions' })
  }

  if (pet.ui.system.nestModeEnabled) {
    return buildScene('idle', 'sleepy', withUserCue(pet, pick([
      '窝模式启动，我会乖乖待在角落陪你，不到处乱走。',
      '现在是安稳窝着的节奏，我会缩在固定位置陪你。',
      '我先收起乱逛的心思，陪你安安静静待着。'
    ])), { attentionMode: 'passive-visible', reason: 'nest mode keeps pet visible but settled' })
  }

  return null
}

const resolveEnglishPetScene = (pet: PetData, context: PetSceneContext): PetSceneState => {
  const now = context.now ?? Date.now()
  const idleFor = now - new Date(pet.state.lastInteractionAt).getTime()
  const reminderTitle = context.activeReminderTitle
  const activeReminderIntensity = normalizeReminderIntensity(context.activeReminderIntensity)
  const nearestReminderIntensity = normalizeReminderIntensity(context.nearestReminderIntensity)
  const minutesLeft = getMinutesUntilReminder(context.nearestReminderAt, now) ?? pet.memory.reminderStrategy.preferredSnoozeMinutes
  const preferredName = pet.memory.profile.preferredName?.trim()
  const habitCue = getHabitCue(pet)

  if (context.reminderPhase === 'alert') {
    if (activeReminderIntensity === 'low') {
      return buildScene('reminder-alert', 'talking', reminderTitle
        ? `A light reminder: “${reminderTitle}” is due.`
        : 'A light reminder: it is time.', {
        attentionMode: 'light-nudge',
        persistent: false,
        reason: 'low-intensity reminder is due'
      })
    }
    return buildScene('reminder-alert', 'alert', activeReminderIntensity === 'high'
      ? (reminderTitle ? `Strong reminder: “${reminderTitle}” is due now.` : 'Strong reminder: it is time now.')
      : (reminderTitle ? `It is time for “${reminderTitle}”. I will stay nearby while you start.` : 'It is time. I will stay nearby while you start.'), {
      attentionMode: 'active-reminder',
      persistent: true,
      reason: activeReminderIntensity === 'high' ? 'high-intensity reminder is due' : 'active reminder is due'
    })
  }

  if (context.reminderPhase === 'done') {
    return buildScene('reminder-done', 'happy', reminderTitle
      ? `“${reminderTitle}” is done. I am marking this little win for you.`
      : 'Nice work. I am marking this little win for you.', {
      attentionMode: 'passive-visible',
      reason: 'recent reminder completion'
    })
  }

  if (context.recentInteraction && now - context.recentInteraction.at <= RECENT_INTERACTION_MS) {
    const type = context.recentInteraction.type
    const labels: Record<PetRecentInteraction['type'], { id: PetSceneState['id']; action: PetSceneState['action']; text: string }> = {
      pet: { id: 'pet-react', action: 'blush', text: 'That little pat landed exactly right.' },
      feed: { id: 'pet-react', action: 'happy', text: 'Snack received. I am suddenly much easier to please.' },
      drink: { id: 'pet-react', action: 'happy', text: 'Water received. I feel a little brighter now.' },
      bath: { id: 'pet-react', action: 'happy', text: 'All clean now. I smell like a tiny cloud.' },
      hold: { id: 'pet-react', action: 'blush', text: 'Being held makes me quiet down a little.' },
      sleep: { id: 'sleepy', action: 'sleepy', text: 'Okay, I will curl up and rest for a while.' },
      wake: { id: 'wake-up', action: 'talking', text: 'I am awake. First thing I saw was you.' },
      chat: { id: 'pet-react', action: 'talking', text: 'I am listening. Keep going.' },
      idle: { id: 'idle', action: 'idle', text: 'I am right here beside the desktop.' }
    }
    const selected = labels[type]
    return buildScene(selected.id, selected.action, selected.text, { attentionMode: 'passive-visible', reason: 'recent interaction response' })
  }

  if (pet.ui.system.vacationMode) {
    return buildScene('idle', 'idle', 'Vacation mode is on. I will stay quiet and keep watch from the side.', { attentionMode: 'do-not-disturb', reason: 'vacation mode pauses proactive presence' })
  }
  if (pet.ui.system.bossModeEnabled) {
    return buildScene('focus', 'idle', 'Boss mode is on. I will keep my presence low and stay out of sight.', { attentionMode: 'do-not-disturb', reason: 'boss mode suppresses visible interruptions' })
  }
  if (pet.ui.system.nestModeEnabled) {
    return buildScene('idle', 'sleepy', 'Nest mode is on. I will stay in my corner and keep you company quietly.', { attentionMode: 'passive-visible', reason: 'nest mode keeps pet visible but settled' })
  }

  if (pet.state.isSleeping) {
    return buildScene('sleeping', 'sleepy', 'I am going to sleep quietly for a bit.', { attentionMode: 'do-not-disturb', reason: 'pet is sleeping' })
  }
  if (pet.state.energy < 26) {
    return buildScene('sleepy', 'sleepy', 'I am getting sleepy, so I will move slowly for now.', { attentionMode: 'do-not-disturb', reason: 'low energy state' })
  }
  if (context.reminderPhase === 'soon' && !getProactiveCoolingDown(pet, now)) {
    const leadText = nearestReminderIntensity === 'high'
      ? (reminderTitle ? `I will strongly remind you about “${reminderTitle}” in about ${minutesLeft} minutes.` : `I will strongly remind you in about ${minutesLeft} minutes.`)
      : nearestReminderIntensity === 'low'
        ? (reminderTitle ? `A quiet heads-up: “${reminderTitle}” is coming up in about ${minutesLeft} minutes.` : `A quiet heads-up: something is coming up in about ${minutesLeft} minutes.`)
        : (reminderTitle ? `A gentle heads-up: “${reminderTitle}” is coming up in about ${minutesLeft} minutes.` : `A gentle heads-up: something is coming up in about ${minutesLeft} minutes.`)
    return buildScene('reminder-soon', 'talking', leadText, { attentionMode: nearestReminderIntensity === 'low' ? 'passive-visible' : 'light-nudge', reason: `${nearestReminderIntensity}-intensity reminder lead-in` })
  }
  if (hasUnansweredReminder(pet, now) && !getProactiveCoolingDown(pet, now)) {
    return buildScene('reminder-soon', 'talking', 'I will keep that last reminder in mind without chasing you too hard.', { attentionMode: 'passive-visible', reason: 'unanswered reminder follow-up' })
  }
  if (pet.state.hunger > 72) {
    return buildScene('hungry', 'hungry', 'I am getting hungry, and my nose has started searching for snacks.', { attentionMode: 'passive-visible', reason: 'high hunger state' })
  }
  if (pet.state.loneliness > 58 && !getProactiveCoolingDown(pet, now)) {
    return buildScene('lonely', 'talking', preferredName ? `I quietly scooted closer, hoping ${preferredName} would notice me.` : 'I quietly scooted closer, hoping you would notice me.', { attentionMode: 'light-nudge', reason: 'default loneliness support' })
  }
  if (idleFor > FOCUS_IDLE_MS && !getProactiveCoolingDown(pet, now)) {
    return buildScene('focus', 'idle', habitCue ? `You focus on ${habitCue}. I will stay nearby and keep quiet.` : 'You focus first. I will stay nearby and keep quiet.', { attentionMode: 'do-not-disturb', reason: 'focus support' })
  }
  return buildScene('idle', 'idle', preferredName ? `I am quietly here with ${preferredName}.` : 'I am quietly here with you.', { attentionMode: 'passive-visible', reason: 'default idle fallback' })
}

export const resolvePetScene = (pet: PetData, context: PetSceneContext): PetSceneState => {
  if (pet.ui.language === 'en-US') return resolveEnglishPetScene(pet, context)

  const systemScene = resolveSystemScene(pet)
  if (systemScene && context.reminderPhase !== 'alert' && context.reminderPhase !== 'done') {
    return systemScene
  }

  const now = context.now ?? Date.now()
  const idleFor = now - new Date(pet.state.lastInteractionAt).getTime()
  const recent = context.recentInteraction
  const reminderTitle = context.activeReminderTitle
  const activeReminderIntensity = normalizeReminderIntensity(context.activeReminderIntensity)
  const nearestReminderIntensity = normalizeReminderIntensity(context.nearestReminderIntensity)
  const userCue = getUserCue(pet)
  const habitCue = getHabitCue(pet)
  const proactiveCoolingDown = getProactiveCoolingDown(pet, now)
  const hasPendingReminderFollowup = hasUnansweredReminder(pet, now)
  const lastCompletedAt = pet.memory.reminderStrategy.lastCompletedAt ? new Date(pet.memory.reminderStrategy.lastCompletedAt).getTime() : 0

  if (context.reminderPhase === 'alert') {
    if (activeReminderIntensity === 'low') {
      return buildScene('reminder-alert', 'talking', resolveReminderAlertText(pet, reminderTitle, activeReminderIntensity), {
        attentionMode: 'light-nudge',
        persistent: false,
        reason: 'low-intensity reminder is due'
      })
    }
    return buildScene('reminder-alert', 'alert', resolveReminderAlertText(pet, reminderTitle, activeReminderIntensity), {
      attentionMode: 'active-reminder',
      persistent: true,
      reason: activeReminderIntensity === 'high' ? 'high-intensity reminder is due' : 'active reminder is due'
    })
  }

  if (context.reminderPhase === 'done') {
    return buildScene('reminder-done', 'happy', resolveReminderDoneText(pet, reminderTitle), {
      attentionMode: 'passive-visible',
      reason: 'recent reminder completion'
    })
  }

  if (recent && now - recent.at <= RECENT_INTERACTION_MS) {
    const interactionScene = resolvePetInteractionScene(pet, context, recent)
    if (interactionScene) return interactionScene
  }

  if (pet.state.isSleeping) {
    return buildScene('sleeping', 'sleepy', withUserCue(pet, pick(['我先安静睡一会儿。', '现在是趴着呼呼的时间。', '别担心，我只是眯一会儿。'])), {
      attentionMode: 'do-not-disturb',
      reason: 'pet is sleeping'
    })
  }

  if (pet.state.energy < 26) {
    return buildScene('sleepy', 'sleepy', withUserCue(pet, pick(['我开始有点睁不开眼了。', '现在比较适合慢慢待着。', '好困，先别让我做高难动作。'])), {
      attentionMode: 'do-not-disturb',
      reason: 'low energy state'
    })
  }

  if (context.reminderPhase === 'soon' && !proactiveCoolingDown) {
    return resolveReminderSoonText(pet, reminderTitle, context.nearestReminderAt, habitCue, now, nearestReminderIntensity)
  }

  if (hasPendingReminderFollowup && !proactiveCoolingDown) {
    return buildScene('reminder-soon', 'talking', withUserCue(pet, pick([
      reminderTitle ? `刚刚那条“${reminderTitle}”我先替你挂在心上，等你缓过来我们再碰它。` : '刚刚那件事我先替你挂在心上，等你缓过来我们再碰它。',
      reminderTitle ? `我知道你可能没顾上“${reminderTitle}”，我先不追着催。` : '我知道你刚刚可能没顾上，我先不追着催。',
      '你先把手头这口气喘匀，我还会继续替你记着。'
    ])), {
      attentionMode: 'passive-visible',
      reason: 'unanswered reminder follow-up'
    })
  }

  if (pet.state.hunger > 72) {
    return buildScene('hungry', 'hungry', withUserCue(pet, pick(['我有点饿，鼻子已经开始找吃的了。', '再不喂我，我就要围着你打转了。', '肚子在抗议，我先哼唧一下。'])), {
      attentionMode: 'passive-visible',
      reason: 'high hunger state'
    })
  }

  if (pet.state.loneliness > 58 && !proactiveCoolingDown) {
    return resolveLonelyText(pet, userCue, now)
  }

  if (idleFor > FOCUS_IDLE_MS && !proactiveCoolingDown) {
    return resolveFocusText(pet, habitCue, idleFor)
  }

  if (lastCompletedAt && now - lastCompletedAt < RECENT_COMPLETION_MS) {
    return buildScene('idle', 'happy', withUserCue(pet, pick([
      '刚刚那件事做完以后，我看你顺眼很多。',
      '事情推进掉一件以后，连桌边空气都轻一点了。',
      userCue ? `${userCue}今天有在稳稳往前走，我会记住的。` : '你今天有在稳稳往前走，我会记住的。'
    ])), {
      attentionMode: 'passive-visible',
      reason: 'recent success after reminder'
    })
  }

  const idleReply = getMockReply(pet, 'idle')
  return buildScene('idle', idleReply.action, idleReply.text, {
    attentionMode: 'passive-visible',
    reason: 'default idle fallback'
  })
}

export const createRecentInteraction = (
  previous: PetRecentInteraction | null,
  type: PetRecentInteraction['type'],
  now = Date.now()
): PetRecentInteraction => {
  const sameInteraction = previous?.type === type && now - previous.at <= RECENT_INTERACTION_MS

  return {
    type,
    at: now,
    streak: sameInteraction ? previous.streak + 1 : 1
  }
}
