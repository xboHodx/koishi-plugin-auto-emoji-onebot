import { Context, Session } from 'koishi'

import { getErrorMessage } from './onebot'
import type { RuntimeEmoji } from './types'

async function getRuntimeEmojis(ctx: Context, groupId: string, userId: string) {
  return await (ctx.database as any).get('runtimeEmoji', { groupId, userId }) as RuntimeEmoji[]
}

function getCommandScope(session: Session | undefined) {
  if (!session) return
  if (session.isDirect) return

  const groupId = session.channelId
  const userId = session.userId

  if (!groupId || !userId) return

  return { groupId, userId }
}

function isDuplicateRuntimeEmojiError(err: unknown) {
  return /duplicate|unique/i.test(getErrorMessage(err))
}

function getRemovedCount(result: unknown) {
  if (typeof result === 'number') return result
  if (result && typeof result === 'object' && 'removed' in result) {
    const removed = (result as { removed?: unknown }).removed
    if (typeof removed === 'number') return removed
  }

  return 0
}

export async function getRuntimeEmojiIds(
  ctx: Context,
  groupId: string,
  userId: string,
  verboseConsoleOutput: boolean,
) {
  try {
    const runtimeEmojis = await getRuntimeEmojis(ctx, groupId, userId)
    const runtimeEmojiIds = runtimeEmojis.map(runtimeEmoji => runtimeEmoji.emojiId)

    if (verboseConsoleOutput) {
      ctx.logger.info(`群 ${groupId} 中用户 ${userId} 加载到运行时表情 ID: ${runtimeEmojiIds.length ? runtimeEmojiIds.join(', ') : '无'}`)
    }

    return runtimeEmojiIds
  } catch (err) {
    if (verboseConsoleOutput) {
      ctx.logger.error(`群 ${groupId} 中用户 ${userId} 读取自定义表情失败: ${getErrorMessage(err)}`)
      ctx.logger.info(`群 ${groupId} 中用户 ${userId} 继续使用静态规则，运行时表情按空处理。`)
    }

    return []
  }
}

export function registerRuntimeEmojiModel(ctx: Context) {
  ctx.model.extend('runtimeEmoji', {
    groupId: 'string(255)',
    userId: 'string(255)',
    emojiId: 'unsigned(8)',
  }, {
    primary: ['groupId', 'userId', 'emojiId'],
  })
}

export function registerRuntimeEmojiCommands(ctx: Context) {
  ctx.command('set-emoji <emojiId:number>', '给自己设置当前群的自动表情，表情id在koishi.js.org/QFace找：特定表情的emojiId或qcid')
    .action(async ({ session }, emojiId: number) => {
    const scope = getCommandScope(session)
    if (!scope) return '仅能在群聊中设置自定义表情'

    try {
      await (ctx.database as any).create('runtimeEmoji', {
        groupId: scope.groupId,
        userId: scope.userId,
        emojiId,
      })
      return `已添加自定义表情 ${emojiId}`
    } catch (err) {
      if (isDuplicateRuntimeEmojiError(err)) {
        return `当前群和用户已经设置过自定义表情 ${emojiId}`
      }

      ctx.logger.error(`设置自定义表情失败: ${getErrorMessage(err)}`)
      return '设置自定义表情失败'
    }
  })

  ctx.command('rm-emoji <emojiId:number>', '取消自己在当前群的自动表情，表情id在koishi.js.org/QFace找：特定表情的emojiId或qcid')
    .action(async ({ session }, emojiId: number) => {
    const scope = getCommandScope(session)
    if (!scope) return '仅能在群聊中管理自定义表情'

    try {
      const removed = await (ctx.database as any).remove('runtimeEmoji', {
        groupId: scope.groupId,
        userId: scope.userId,
        emojiId,
      })
      const removedCount = getRemovedCount(removed)

      if (!removedCount) {
        return `当前群和用户没有设置自定义表情 ${emojiId}`
      }

      return `已移除当前群和用户的自定义表情 ${emojiId}`
    } catch (err) {
      ctx.logger.error(`移除自定义表情失败: ${getErrorMessage(err)}`)
      return '移除自定义表情失败'
    }
  })

  ctx.command('clear-emoji', '清空自己在当前群的自动表情').action(async ({ session }) => {
    const scope = getCommandScope(session)
    if (!scope) return '仅能在群聊中管理自定义表情'

    try {
      const removed = await (ctx.database as any).remove('runtimeEmoji', {
        groupId: scope.groupId,
        userId: scope.userId,
      })
      const removedCount = getRemovedCount(removed)

      if (!removedCount) {
        return '当前群和用户没有自定义表情可清空'
      }

      return `已清空当前群和用户的自定义表情，共 ${removedCount} 个`
    } catch (err) {
      ctx.logger.error(`清空自定义表情失败: ${getErrorMessage(err)}`)
      return '清空自定义表情失败'
    }
  })
}
