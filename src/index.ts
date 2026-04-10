import { Context } from 'koishi'

import { registerRuleReactionListener } from './rule-reaction'
import { registerRuntimeEmojiCommands, registerRuntimeEmojiModel } from './runtime-emoji'
import { Config as ConfigSchema } from './schema'
import { registerSameEmojiListener } from './same-emoji'
import type { Config as PluginConfig } from './types'
export type { Config as PluginConfig, EmojiRule, RuntimeEmoji } from './types'

export const name = 'auto-emoji-onebot'
export const inject = ['database']
export { ConfigSchema as Config }

export function apply(ctx: Context, config: PluginConfig) {
  registerRuntimeEmojiModel(ctx)
  registerRuntimeEmojiCommands(ctx)
  registerRuleReactionListener(ctx, config)
  registerSameEmojiListener(ctx, config)
}
