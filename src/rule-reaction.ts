import { Context } from 'koishi'

import { addEmojiReaction, getOneBot, getReactionTarget } from './onebot'
import { getRuntimeEmojiIds } from './runtime-emoji'
import type { Config, EmojiRule } from './types'

function getMatchedEmojiIds(rules: EmojiRule[], groupId: string, userId: string) {
  const matchedEmojiIds: number[] = []

  for (const rule of rules) {
    if (!rule.groupIds.includes(groupId)) continue
    if (!rule.userIds.includes(userId)) continue
    matchedEmojiIds.push(...rule.emojiIds)
  }

  return [...new Set(matchedEmojiIds)]
}

async function getMergedEmojiIds(
  ctx: Context,
  rules: EmojiRule[],
  groupId: string,
  userId: string,
  verboseConsoleOutput: boolean,
) {
  const mergedEmojiIds = new Set(getMatchedEmojiIds(rules, groupId, userId))
  const runtimeEmojiIds = await getRuntimeEmojiIds(ctx, groupId, userId, verboseConsoleOutput)

  for (const runtimeEmojiId of runtimeEmojiIds) {
    mergedEmojiIds.add(runtimeEmojiId)
  }

  const mergedEmojiIdList = [...mergedEmojiIds]

  if (verboseConsoleOutput) {
    ctx.logger.info(`群 ${groupId} 中用户 ${userId} 最终用于分发的表情 ID: ${mergedEmojiIdList.length ? mergedEmojiIdList.join(', ') : '无'}`)
  }

  return mergedEmojiIdList
}

export function registerRuleReactionListener(ctx: Context, config: Config) {
  ctx.on('message', async (session) => {
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
        ctx.logger.info('当前消息缺少群号或消息 ID，跳过自动表情。')
      }
      return
    }

    const userId = session.userId
    if (!userId) {
      if (config.verboseConsoleOutput) {
        ctx.logger.info(`群 ${target.groupId} 的消息缺少用户 ID，跳过自动表情。`)
      }
      return
    }

    const matchedEmojiIds = await getMergedEmojiIds(ctx, config.rules, target.groupId, userId, config.verboseConsoleOutput)

    if (!matchedEmojiIds.length) {
      if (config.verboseConsoleOutput) {
        ctx.logger.info(`群 ${target.groupId} 中用户 ${userId} 未命中任何自动表情规则。`)
      }
      return
    }

    for (const emojiId of matchedEmojiIds) {
      await addEmojiReaction(ctx, target, onebot, emojiId)
    }
  })
}
