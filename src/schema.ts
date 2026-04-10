import { Schema } from 'koishi'

import type { Config as PluginConfig, EmojiRule } from './types'

const EmojiRuleSchema: Schema<EmojiRule> = Schema.object({
  groupIds: Schema.array(Schema.string().required())
    .role('table')
    .description('生效群号列表')
    .required(),
  userIds: Schema.array(Schema.string().required())
    .role('table')
    .description('生效用户列表')
    .required(),
  emojiIds: Schema.array(Schema.number().required())
    .role('table')
    .description('自动添加的表情 ID 列表')
    .required(),
})

export const Config: Schema<PluginConfig> = Schema.intersect([
  Schema.object({
    rules: Schema.array(EmojiRuleSchema)
      .role('table')
      .default([])
      .description('在哪些群对哪些人自动添加哪些表情'),
    reactSameEmoji: Schema.boolean()
      .default(false)
      .description('是否回应相同表情'),
  }).description('基础设置'),

  Schema.object({
    verboseConsoleOutput: Schema.boolean()
      .default(false),
  }).description('debug'),
])
