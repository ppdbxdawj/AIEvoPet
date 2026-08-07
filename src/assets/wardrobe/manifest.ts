import type { WardrobeItem } from '../../types/wardrobe'

// Bundled wardrobe manifest. Asset urls are intentionally left undefined
// here — once a contributor generates a PNG (any pixel-art image-gen
// pipeline works) and cuts it out, the matching entry gets an actual
// import. Until then the renderer falls back to a labelled placeholder,
// but the shop / selection / placement layers all work on metadata alone,
// so we can build / test those end-to-end first.
//
// To wire a real PNG, replace e.g.
//   { id: 'hat-baseball-cap', ..., assetUrl: undefined }
// with
//   import baseballCapUrl from './hat/hat-baseball-cap.png'
//   { id: 'hat-baseball-cap', ..., assetUrl: baseballCapUrl }

export const WARDROBE_ITEMS: WardrobeItem[] = [
  // ── 头饰 hat × 12 ───────────────────────────────────────────────────────
  { id: 'hat-baseball-cap', nameZh: '棒球帽', category: 'hat', slot: 'head-top', moodTags: ['playful', 'cool'], priceBand: 'low', price: 12, description: '红色棒球帽' },
  { id: 'hat-bucket-hat', nameEn: 'Bucket hat', nameZh: '渔夫帽', category: 'hat', slot: 'head-top', moodTags: ['quiet', 'cozy'], priceBand: 'low', price: 14, descriptionEn: 'Beige bucket hat', description: '米色渔夫帽' },
  { id: 'hat-straw-hat', nameEn: 'Straw hat', nameZh: '草帽', category: 'hat', slot: 'head-top', moodTags: ['playful', 'cozy'], priceBand: 'mid', price: 22, descriptionEn: 'Yellow straw hat with red bow ribbons', description: '黄色草帽，红色蝴蝶结飘带' },
  { id: 'hat-beret', nameEn: 'Beret', nameZh: '贝雷帽', category: 'hat', slot: 'head-top', moodTags: ['sweet', 'focus'], priceBand: 'mid', price: 24, descriptionEn: 'French deep red beret', description: '法式深红色贝雷帽' },
  { id: 'hat-crown', nameEn: 'Little crown', nameZh: '小王冠', category: 'hat', slot: 'head-top', moodTags: ['celebrate', 'cool'], priceBand: 'high', price: 68, descriptionEn: 'Gold little crown with five red gems', description: '金色小王冠，五颗红宝石' },
  { id: 'hat-santa-hat', nameEn: 'Santa hat', nameZh: '圣诞帽', category: 'hat', slot: 'head-top', moodTags: ['celebrate', 'cozy'], priceBand: 'mid', price: 28, descriptionEn: 'Red Santa hat with white plush trim', description: '红色圣诞帽，白色绒边' },
  { id: 'hat-bunny-ears', nameEn: 'Bunny-ear headband', nameZh: '兔耳头箍', category: 'hat', slot: 'head-top', moodTags: ['sweet', 'playful'], priceBand: 'mid', price: 26, descriptionEn: 'Pink and white bunny-ear headband', description: '粉白色兔耳头箍' },
  { id: 'hat-chef-hat', nameEn: 'Little chef hat', nameZh: '小厨师帽', category: 'hat', slot: 'head-top', moodTags: ['playful', 'cozy'], priceBand: 'mid', price: 22, descriptionEn: 'White tall chef hat', description: '白色高顶厨师帽' },
  { id: 'hat-grad-cap', nameEn: 'Graduation cap', nameZh: '学士帽', category: 'hat', slot: 'head-top', moodTags: ['focus', 'celebrate'], priceBand: 'mid', price: 30, descriptionEn: 'Black graduation cap with gold tassel', description: '黑色学士帽，金色流苏' },
  { id: 'hat-sakura-tiara', nameEn: 'Sakura tiara', nameZh: '樱花头饰', category: 'hat', slot: 'head-top', moodTags: ['sweet', 'mystic'], priceBand: 'high', price: 52, descriptionEn: 'Pink sakura flower crown', description: '粉色樱花花环头饰' },
  { id: 'hat-snow-tiara', nameEn: 'Snowflake tiara', nameZh: '雪花头饰', category: 'hat', slot: 'head-top', moodTags: ['quiet', 'mystic'], priceBand: 'high', price: 52, descriptionEn: 'Light blue snowflake flower crown', description: '淡蓝色雪花花环头饰' },
  { id: 'hat-fried-egg', nameEn: 'Fried egg hat', nameZh: '头顶煎蛋', category: 'hat', slot: 'head-top', moodTags: ['playful'], priceBand: 'low', price: 10, descriptionEn: 'Silly fried egg', description: '搞怪煎蛋' },

  // ── 眼镜 glasses × 6 ───────────────────────────────────────────────────
  { id: 'glasses-round', nameEn: 'Round glasses', nameZh: '圆框眼镜', category: 'glasses', slot: 'face', moodTags: ['quiet', 'focus'], priceBand: 'low', price: 15, descriptionEn: 'Classic round metal glasses', description: '经典圆框金属眼镜' },
  { id: 'glasses-sunglasses', nameEn: 'Sunglasses', nameZh: '太阳镜', category: 'glasses', slot: 'face', moodTags: ['cool', 'playful'], priceBand: 'mid', price: 28, descriptionEn: 'Black aviator sunglasses', description: '黑色飞行员太阳镜' },
  { id: 'glasses-heart', nameEn: 'Heart glasses', nameZh: '心形眼镜', category: 'glasses', slot: 'face', moodTags: ['sweet', 'playful'], priceBand: 'mid', price: 24, descriptionEn: 'Pink heart-shaped glasses', description: '粉色心形眼镜' },
  { id: 'glasses-monocle', nameEn: 'Monocle', nameZh: '单片眼镜', category: 'glasses', slot: 'face', moodTags: ['focus', 'cool'], priceBand: 'mid', price: 30, descriptionEn: 'Gold monocle with chain', description: '金色单片眼镜带链条' },
  { id: 'glasses-goggles', nameEn: 'Goggles', nameZh: '护目镜', category: 'glasses', slot: 'face', moodTags: ['focus', 'mystic'], priceBand: 'mid', price: 32, descriptionEn: 'Orange lab goggles', description: '橙色实验室护目镜' },
  { id: 'glasses-eye-patch', nameEn: 'Pirate eye patch', nameZh: '海盗眼罩', category: 'glasses', slot: 'face', moodTags: ['melancholy', 'cool'], priceBand: 'low', price: 14, descriptionEn: 'Black oval pirate eye patch', description: '黑色椭圆海盗眼罩' },

  // ── 嘴部 mouth × 5 ─────────────────────────────────────────────────────
  { id: 'mouth-lollipop', nameEn: 'Lollipop', nameZh: '棒棒糖', category: 'mouth', slot: 'mouth', moodTags: ['sweet', 'playful'], priceBand: 'low', price: 10, descriptionEn: 'Rainbow swirl lollipop', description: '彩虹螺旋棒棒糖' },
  { id: 'mouth-pacifier', nameEn: 'Pacifier', nameZh: '奶嘴', category: 'mouth', slot: 'mouth', moodTags: ['sweet', 'cozy'], priceBand: 'low', price: 8, descriptionEn: 'Light blue baby pacifier', description: '浅蓝色婴儿奶嘴' },
  { id: 'mouth-leaf-bite', nameEn: 'Leaf in mouth', nameZh: '叼一片树叶', category: 'mouth', slot: 'mouth', moodTags: ['quiet', 'mystic'], priceBand: 'low', price: 10, descriptionEn: 'Green olive leaf', description: '绿色橄榄叶' },
  { id: 'mouth-fish-bite', nameEn: 'Tiny fish bite', nameZh: '叼一条小鱼', category: 'mouth', slot: 'mouth', moodTags: ['playful'], priceBand: 'mid', price: 18, descriptionEn: 'Orange tiny fish', description: '橙色小鱼' },
  { id: 'mouth-mustache', nameEn: 'Little mustache', nameZh: '小胡子', category: 'mouth', slot: 'mouth', moodTags: ['cool', 'focus'], priceBand: 'mid', price: 20, descriptionEn: 'Black curled mustache', description: '黑色翘八字胡' },

  // ── 脖子 neck × 6 ───────────────────────────────────────────────────────
  { id: 'neck-warm-scarf', nameEn: 'Knitted scarf', nameZh: '毛线围巾', category: 'neck', slot: 'neck', moodTags: ['cozy'], priceBand: 'low', price: 15, descriptionEn: 'Red and white checked knitted scarf', description: '红白格子毛线围巾' },
  { id: 'neck-bow-tie', nameEn: 'Bow tie', nameZh: '蝴蝶结领结', category: 'neck', slot: 'neck', moodTags: ['sweet', 'focus'], priceBand: 'low', price: 12, descriptionEn: 'Deep blue bow tie', description: '深蓝色蝴蝶结领结' },
  { id: 'neck-pearl-necklace', nameEn: 'Pearl necklace', nameZh: '珍珠项链', category: 'neck', slot: 'neck', moodTags: ['sweet', 'celebrate'], priceBand: 'mid', price: 32, descriptionEn: 'White round pearl necklace', description: '白色圆珍珠项链' },
  { id: 'neck-bell-collar', nameEn: 'Bell collar', nameZh: '铃铛项圈', category: 'neck', slot: 'neck', moodTags: ['playful', 'sweet'], priceBand: 'low', price: 10, descriptionEn: 'Red collar with gold bell', description: '红色项圈，金色铃铛' },
  { id: 'neck-red-ribbon', nameEn: 'Red ribbon', nameZh: '红丝带', category: 'neck', slot: 'neck', moodTags: ['sweet', 'playful'], priceBand: 'low', price: 8, descriptionEn: 'Red satin ribbon bow', description: '红色绸缎丝带蝴蝶结' },
  { id: 'neck-bib', nameEn: 'Bib', nameZh: '围嘴', category: 'neck', slot: 'chest', moodTags: ['sweet', 'cozy'], priceBand: 'low', price: 10, descriptionEn: 'Yellow cartoon bib with smiley face', description: '黄色卡通围嘴带笑脸' },

  // ── 背后 back × 5 ───────────────────────────────────────────────────────
  { id: 'back-angel-wings', nameEn: 'Angel wings', nameZh: '天使翅膀', category: 'back', slot: 'back', moodTags: ['celebrate', 'mystic'], priceBand: 'high', price: 72, descriptionEn: 'White feather angel wings', description: '白色羽毛天使翅膀' },
  { id: 'back-butterfly-wings', nameEn: 'Butterfly wings', nameZh: '蝴蝶翅膀', category: 'back', slot: 'back', moodTags: ['sweet', 'mystic'], priceBand: 'high', price: 58, descriptionEn: 'Pink-purple gradient butterfly wings', description: '粉紫渐变蝴蝶翅膀' },
  { id: 'back-dragon-wings', nameEn: 'Dragon wings', nameZh: '龙翼', category: 'back', slot: 'back', moodTags: ['cool', 'mystic'], priceBand: 'high', price: 80, descriptionEn: 'Dark red bat-like dragon wings', description: '暗红色蝙蝠状龙翼' },
  { id: 'back-mini-backpack', nameEn: 'Mini backpack', nameZh: '小书包', category: 'back', slot: 'back', moodTags: ['focus', 'cozy'], priceBand: 'mid', price: 28, descriptionEn: 'Yellow cartoon mini backpack', description: '黄色卡通小书包' },
  { id: 'back-red-cape', nameEn: 'Red cape', nameZh: '红披风', category: 'back', slot: 'back', moodTags: ['celebrate', 'cool'], priceBand: 'mid', price: 40, descriptionEn: 'Red satin cape', description: '红色绸缎披风' },

  // ── 手持 hand × 8 ──────────────────────────────────────────────────────
  { id: 'hand-coffee-mug', nameEn: 'Coffee mug', nameZh: '马克杯', category: 'hand', slot: 'hand', moodTags: ['cozy', 'focus'], priceBand: 'low', price: 12, descriptionEn: 'White ceramic mug with light blue steam', description: '白色陶瓷马克杯，淡蓝热气' },
  { id: 'hand-umbrella', nameEn: 'Little umbrella', nameZh: '小雨伞', category: 'hand', slot: 'hand', moodTags: ['quiet', 'melancholy'], priceBand: 'mid', price: 18, descriptionEn: 'Yellow little umbrella', description: '黄色小雨伞' },
  { id: 'hand-balloon', nameEn: 'Balloon', nameZh: '气球', category: 'hand', slot: 'hand', moodTags: ['celebrate', 'playful'], priceBand: 'low', price: 10, descriptionEn: 'Red heart-shaped balloon', description: '红色心形气球' },
  { id: 'hand-flower', nameEn: 'Little flower', nameZh: '小花', category: 'hand', slot: 'hand', moodTags: ['sweet', 'cozy'], priceBand: 'low', price: 8, descriptionEn: 'Small daisy', description: '小雏菊' },
  { id: 'hand-fishing-rod', nameEn: 'Fishing rod', nameZh: '钓鱼竿', category: 'hand', slot: 'hand', moodTags: ['quiet', 'focus'], priceBand: 'mid', price: 30, descriptionEn: 'Brown fishing rod', description: '棕色钓鱼竿' },
  { id: 'hand-violin', nameEn: 'Violin', nameZh: '小提琴', category: 'hand', slot: 'hand', moodTags: ['focus', 'mystic'], priceBand: 'high', price: 55, descriptionEn: 'Brown violin with bow', description: '棕色小提琴含琴弓' },
  { id: 'hand-mini-laptop', nameEn: 'Mini laptop', nameZh: '迷你笔记本', category: 'hand', slot: 'hand', moodTags: ['focus'], priceBand: 'mid', price: 35, descriptionEn: 'Silver laptop computer', description: '银色笔记本电脑' },
  { id: 'hand-gift-box', nameEn: 'Gift box', nameZh: '礼物盒', category: 'hand', slot: 'hand', moodTags: ['celebrate', 'sweet'], priceBand: 'mid', price: 25, descriptionEn: 'Pink gift box with gold bow', description: '粉色礼物盒，金色蝴蝶结' },

  // ── 特殊飘浮 special × 6 ───────────────────────────────────────────────
  { id: 'special-water-drop', nameEn: 'Water drop', nameZh: '头顶水滴', category: 'special', slot: 'floating', moodTags: ['melancholy'], priceBand: 'low', price: 8, descriptionEn: 'Floating blue water drop', description: '悬浮蓝色水滴' },
  { id: 'special-lightning', nameEn: 'Lightning bolt', nameZh: '头顶闪电', category: 'special', slot: 'floating', moodTags: ['cool', 'focus'], priceBand: 'low', price: 10, descriptionEn: 'Golden lightning symbol', description: '金黄色闪电符号' },
  { id: 'special-rainbow', nameEn: 'Rainbow', nameZh: '头顶彩虹', category: 'special', slot: 'floating', moodTags: ['celebrate', 'sweet'], priceBand: 'mid', price: 22, descriptionEn: 'Semicircle rainbow', description: '半圆彩虹' },
  { id: 'special-rain-cloud', nameEn: 'Little rain cloud', nameZh: '头顶小雨云', category: 'special', slot: 'floating', moodTags: ['melancholy', 'quiet'], priceBand: 'low', price: 12, descriptionEn: 'Gray little cloud with three raindrops', description: '灰色小云带 3 滴雨' },
  { id: 'special-sparkle-stars', nameEn: 'Sparkle stars', nameZh: '头顶星星', category: 'special', slot: 'floating', moodTags: ['celebrate', 'sweet'], priceBand: 'low', price: 10, descriptionEn: 'Three golden four-point stars', description: '三颗金色四角星星' },
  { id: 'special-zzz', nameEn: 'Floating ZZZ', nameZh: '头顶 ZZZ', category: 'special', slot: 'floating', moodTags: ['quiet', 'cozy'], priceBand: 'low', price: 8, descriptionEn: 'Three white Z letters in a stair-step pattern', description: '三个白色字母 Z 阶梯' }
]

// Frozen lookup map. Used by render layer / shop / placement editor for
// O(1) id → item resolution.
export const WARDROBE_ITEMS_BY_ID: Readonly<Record<string, WardrobeItem>> = Object.freeze(
  WARDROBE_ITEMS.reduce<Record<string, WardrobeItem>>((acc, item) => {
    acc[item.id] = item
    return acc
  }, {})
)

export const getWardrobeItemById = (id: string): WardrobeItem | undefined => WARDROBE_ITEMS_BY_ID[id]
