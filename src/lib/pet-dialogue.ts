import { buildPetGenerationRequest, toFallbackReply } from './pet-prompt'
import { generatePetReply } from './pet-llm'
import type { InteractionType, PetData, PetGeneratedReply, PetLanguage, PetRecentInteraction, PetReminderIntensity, PetReminderPhase, PetReply, PetSceneState } from '../types/pet'

const randomPick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]

const getUserCue = (pet: PetData) => pet.memory.profile.preferredName?.trim() ?? ''

const withUserCue = (pet: PetData, text: string) => {
  const cue = getUserCue(pet)
  return cue ? text.replace('{user}', cue) : text.replace('，{user}', '').replace('{user}，', '').replace('{user}', '')
}

const getTopHabit = (pet: PetData) => pet.memory.profile.habits[0] || ''

const isEnglish = (pet: PetData): boolean => pet.ui.language === 'en-US'

const textByLanguage = <T,>(language: PetLanguage, zh: T, en: T) => language === 'en-US' ? en : zh

export const getMockReply = (pet: PetData, type: InteractionType, userInput?: string): PetReply => {
  const name = pet.personality.name
  const habit = getTopHabit(pet)
  const language = isEnglish(pet) ? 'en-US' : 'zh-CN'

  if (type === 'feed') {
    return {
      text: withUserCue(pet, randomPick(textByLanguage(language,
        [`${name}吃饱了一点，心情也跟着亮起来。`, `谢谢投喂，我会乖一点陪着你。`, `${name}把小零食收下了，现在舒服多了，{user}。`],
        [`${name} feels a little fuller and brighter now.`, `Thanks for the snack. I will stay close and behave.`, `${name} accepts the treat and feels much better, {user}.`]
      ))),
      action: 'happy',
      moodDelta: 8,
      affectionDelta: 4,
      memoryWrite: textByLanguage(language, '你喂了它，它开心地记住了这次投喂。', 'You fed it, and it happily remembered this little care moment.')
    }
  }

  if (type === 'drink') {
    return {
      text: withUserCue(pet, randomPick(textByLanguage(language,
        [`${name}喝了点水，精神清爽了一些。`, `水收到了，谢谢你记得照顾我。`, `喝完舒服多了，我会继续陪着{user}。`],
        [`${name} drinks some water and looks a little brighter.`, `Water received. Thank you for taking care of me.`, `That feels better. I will keep staying with {user}.`]
      ))),
      action: 'happy',
      moodDelta: 6,
      affectionDelta: 3,
      memoryWrite: textByLanguage(language, '你提醒它喝了水，它感觉更舒服了。', 'You reminded it to drink water, and it felt more comfortable.')
    }
  }

  if (type === 'bath') {
    return {
      text: withUserCue(pet, randomPick(textByLanguage(language,
        [`洗好啦，现在清清爽爽。`, `${name}整理干净了，看起来舒服多了。`, `被你照顾干净的感觉还不错，{user}。`],
        [`Bath done. Everything feels clean and fresh now.`, `${name} is cleaned up and looks much more comfortable.`, `Being cleaned up by you feels pretty nice, {user}.`]
      ))),
      action: 'happy',
      moodDelta: 7,
      affectionDelta: 2,
      memoryWrite: textByLanguage(language, '你帮它清理干净，它记住了这种被照顾的感觉。', 'You cleaned it up, and it remembered the feeling of being cared for.')
    }
  }

  if (type === 'hold') {
    return {
      text: withUserCue(pet, randomPick(textByLanguage(language,
        [`被你抱起来的时候，我就不想乱闹了。`, `${name}往你怀里拱了拱，整只都安静下来。`, `哼，我只是暂时借{user}抱一下，不代表我很黏人。`],
        [`When you hold me, I stop wanting to make trouble.`, `${name} nestles in closer and goes quiet.`, `Hmph, I am only borrowing {user}'s hug for a moment. It does not mean I am clingy.`]
      ))),
      action: 'blush',
      moodDelta: 12,
      affectionDelta: 7,
      memoryWrite: textByLanguage(language, '你把它抱在怀里，它明显更依赖你了。', 'You held it close, and it clearly felt more attached to you.')
    }
  }

  if (type === 'sleep') {
    return {
      text: withUserCue(pet, randomPick(textByLanguage(language,
        [`那我先眯一会儿，你不许偷偷走开。`, `${name}缩成一团，准备睡觉了。`, `困了……醒来以后还要第一眼看到你，{user}。`],
        [`I will nap for a bit. Do not sneak away.`, `${name} curls up and gets ready to sleep.`, `Sleepy... when I wake up, I still want to see you first, {user}.`]
      ))),
      action: 'sleepy',
      moodDelta: 4,
      affectionDelta: 2
    }
  }

  if (type === 'wake') {
    return {
      text: withUserCue(pet, randomPick(textByLanguage(language,
        [`唔……你来啦，我醒了。`, `${name}揉揉眼睛，迷迷糊糊地看着你。`, `才不是赖床，我只是在做梦，梦到{user}还在旁边。`],
        [`Mm... you are here. I am awake now.`, `${name} rubs sleepy eyes and looks up at you.`, `I was not sleeping in. I was dreaming that {user} was still beside me.`]
      ))),
      action: 'talking',
      moodDelta: 5,
      affectionDelta: 2
    }
  }

  if (type === 'idle') {
    if (pet.state.hunger > 72) {
      return {
        text: withUserCue(pet, randomPick(textByLanguage(language,
          [`${name}开始围着你转了，我饿了。`, `肚子咕噜咕噜……你有没有在看我呀？`, `再不喂我，我就要委屈给{user}看了。`],
          [`${name} starts circling around you. I am hungry.`, `My belly is rumbling... are you looking at me?`, `If you do not feed me soon, I will look very wronged at {user}.`]
        ))),
        action: 'hungry'
      }
    }

    if (pet.state.energy < 28 || pet.state.isSleeping) {
      return {
        text: withUserCue(pet, randomPick(textByLanguage(language,
          [`${name}趴下来打了个小哈欠。`, `好困……让我贴着桌角再眯一会儿。`, `现在是安静发呆模式，我会乖一点陪{user}。`],
          [`${name} lies down and lets out a tiny yawn.`, `So sleepy... let me nap by the desk corner for a bit.`, `Quiet staring mode now. I will behave and keep {user} company.`]
        ))),
        action: 'sleepy'
      }
    }

    if (pet.state.loneliness > 55) {
      return {
        text: withUserCue(pet, randomPick(textByLanguage(language,
          [`你是不是有一会儿没理我啦？`, `${name}偷偷朝你这边挪了挪。`, `我只是刚好想再靠近{user}一点。`],
          [`Have you been ignoring me for a little while?`, `${name} quietly shuffles a little closer to you.`, `I just happened to want to be a bit closer to {user}.`]
        ))),
        action: 'talking'
      }
    }

    if (habit) {
      return {
        text: withUserCue(pet, randomPick(textByLanguage(language,
          [`今天也想陪着你慢慢处理${habit}。`, `${name}安静待着，顺便陪你顾着${habit}。`, `你继续忙${habit}吧，我就在旁边。`],
          [`I want to keep you company while you work through ${habit} today.`, `${name} stays quiet and keeps an eye on ${habit} with you.`, `You can keep working on ${habit}. I will be right here.`]
        ))),
        action: 'idle'
      }
    }

    return {
      text: withUserCue(pet, randomPick(textByLanguage(language,
        [`${name}在桌角晃来晃去，好像在等你理它。`, `它悄悄看了你一眼，又假装什么都没发生。`, `今天也想陪着{user}发呆。`],
        [`${name} wanders around the desk corner, waiting for your attention.`, `It sneaks a glance at you, then pretends nothing happened.`, `I want to zone out beside {user} today too.`]
      ))),
      action: 'idle'
    }
  }

  const input = userInput?.trim()
  if (input) {
    return {
      text: withUserCue(pet, randomPick(textByLanguage(language,
        [
          `你刚刚说“${input}”对吧？${name}有在认真听。`,
          `${name}记住啦。虽然我表面上不在意。`,
          `唔，那听起来很重要。我会陪着{user}。`
        ],
        [
          `You just said “${input}”, right? ${name} was listening carefully.`,
          `${name} remembered that. Even if I pretend not to care.`,
          `Mm, that sounds important. I will stay with {user}.`
        ]
      ))),
      action: 'talking',
      moodDelta: 6,
      affectionDelta: 3,
      memoryWrite: textByLanguage(language, `你对它说了“${input}”，它认真地记住了。`, `You said “${input}” to it, and it carefully remembered that.`)
    }
  }

  return {
    text: withUserCue(pet, textByLanguage(language, `${name}抬头看着你，像是在等你开口。`, `${name} looks up at you, as if waiting for you to speak.`)),
    action: 'talking',
    moodDelta: 3,
    affectionDelta: 2
  }
}

interface GeneratePetDialogueInput {
  pet: PetData
  scene: PetSceneState
  reminderPhase: PetReminderPhase
  interactionType?: InteractionType
  userInput?: string
  recentInteraction?: PetRecentInteraction | null
  activeReminderTitle?: string
  activeReminderIntensity?: PetReminderIntensity
  nearestReminderAt?: string | null
  nearestReminderIntensity?: PetReminderIntensity
  // Pin a "the user hasn't told us about $key in $daysSince days" directive
  // onto the prompt so the model centres a single line on it. Used by the
  // proactive recall scheduler in pet-companion.ts.
  factRecall?: { key: string; latest: string; daysSince: number }
}

export const generatePetDialogue = async ({
  pet,
  scene,
  reminderPhase,
  interactionType,
  userInput,
  recentInteraction,
  activeReminderTitle,
  activeReminderIntensity,
  nearestReminderAt,
  nearestReminderIntensity,
  factRecall
}: GeneratePetDialogueInput): Promise<PetGeneratedReply> => {
  return generatePetReply(
    buildPetGenerationRequest({
      pet,
      scene,
      reminderPhase,
      interactionType,
      userInput,
      recentInteraction,
      activeReminderTitle,
      activeReminderIntensity,
      nearestReminderAt,
      nearestReminderIntensity,
      factRecall
    }),
    toFallbackReply(scene)
  )
}

/*
 * Interaction refusal copy (`interaction.refuse.*`) ships in src/lib/i18n.ts.
 * Runtime chooses keys via getCareInteractionRefusalKey in src/lib/pet-care-interaction.ts.
 */
