import { Context, h } from 'koishi'

import { getOneBot, getReactionTarget } from './onebot'
import type { Config } from './types'

export function registerSameEmojiListener(ctx: Context, config: Config) {
  ctx.on('message', async (session) => {
    if (!config.reactSameEmoji) return

    const onebot = getOneBot(session)
    if (!onebot) {
      if (config.verboseConsoleOutput) {
        ctx.logger.error('当前会话不支持onebot协议。')
      }
      return
    }

    const target = getReactionTarget(session)
    if (!target) {
      if (config.verboseConsoleOutput) {
        ctx.logger.info('当前消息缺少群号或消息 ID，跳过相同表情回复。')
      }
      return
    }

    const content = session.content ?? ''

    for (const element of h.select(h.parse(content), 'face')) {
      if (!element.attrs?.id) continue

      if (config.verboseConsoleOutput) {
        ctx.logger.info(`发现表情，回复相同表情，id=${element.attrs.id}`)
      }

      await onebot._request('set_group_reaction', {
        group_id: target.groupId,
        message_id: target.messageId,
        code: element.attrs.id,
        is_add: true,
      })

      await onebot._request('set_msg_emoji_like', {
        message_id: target.messageId,
        emoji_id: element.attrs.id,
      })
    }
  })
}
