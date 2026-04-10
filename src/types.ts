export interface EmojiRule {
  groupIds: string[]
  userIds: string[]
  emojiIds: number[]
}

export interface RuntimeEmoji {
  groupId: string
  userId: string
  emojiId: number
}

declare module 'koishi' {
  interface Tables {
    runtimeEmoji: RuntimeEmoji
  }
}

export interface Config {
  rules: EmojiRule[]
  reactSameEmoji: boolean
  verboseConsoleOutput: boolean
}
