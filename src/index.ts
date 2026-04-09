import { Context, Schema, Session, h } from 'koishi'

export const name = 'auto-emoji-onebot'

interface OneBotLike {
  _request(action: string, params: Record<string, unknown>): Promise<unknown>
}

type OneBotSession = Session & {
  onebot?: OneBotLike
}

function getOneBot(session: Session) {
  const onebot = (session as OneBotSession).onebot
  if (onebot && typeof onebot._request === 'function') return onebot
}

export interface EmojiRule {
  groupIds: string[];
  userIds: string[];
  emojiIds: number[];
}

export interface Config {
  rules: EmojiRule[];
  reactSameEmoji: boolean;
  verboseConsoleOutput: boolean;
}

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

function getMatchedEmojiIds(rules: EmojiRule[], groupId: string, userId: string) {
  const matchedEmojiIds: number[] = []

  for (const rule of rules) {
    if (!rule.groupIds.includes(groupId)) continue
    if (!rule.userIds.includes(userId)) continue
    matchedEmojiIds.push(...rule.emojiIds)
  }

  return [...new Set(matchedEmojiIds)]
}

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function getReactionTarget(session: Session) {
  const groupId = session.channelId
  const messageId = session.event.message?.id ?? session.messageId

  if (!groupId || !messageId) return

  return { groupId, messageId }
}

async function addEmojiReaction(
  ctx: Context,
  target: { groupId: string; messageId: string },
  onebot: OneBotLike,
  emojiId: number,
) {
  await onebot._request(
    "set_group_reaction",
    {
      "group_id": target.groupId,
      "message_id": target.messageId,
      "code": String(emojiId),
      "is_add": true
    }
  ).catch((err) => {
    ctx.logger.error(`lagrange添加表情失败: ${getErrorMessage(err)}`);
  })

  await onebot._request(
    "set_msg_emoji_like",
    {
      message_id: target.messageId,
      emoji_id: emojiId,
    }
  ).catch((err) => {
    ctx.logger.error(`napcat添加表情失败: ${getErrorMessage(err)}`);
  })
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    rules: Schema.array(EmojiRuleSchema)
      .role('table')
      .default([])
      .description("在哪些群对哪些人自动添加哪些表情"),
    reactSameEmoji: Schema.boolean()
      .default(false)
      .description("是否回应相同表情")
  }).description("基础设置"),

  Schema.object({
    verboseConsoleOutput: Schema.boolean()
      .default(false),
  }).description("debug"),
])

export function apply(ctx: Context, config: Config) {
  ctx.on('message', async (session) => {
    const onebot = getOneBot(session)
    if (!onebot) {
      if (config.verboseConsoleOutput) {
        ctx.logger.error("当前会话不支持onebot协议。");
      }
      return;
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

    const matchedEmojiIds = getMatchedEmojiIds(config.rules, target.groupId, userId)

    if (!matchedEmojiIds.length) {
      if (config.verboseConsoleOutput) {
        ctx.logger.info(`群 ${target.groupId} 中用户 ${userId} 未命中任何自动表情规则。`);
      }
      return;
    }

    if (config.verboseConsoleOutput) {
      ctx.logger.info(`群 ${target.groupId} 中用户 ${userId} 命中规则，准备添加表情: ${matchedEmojiIds.join(', ')}`);
    }

    for (const emojiId of matchedEmojiIds) {
      await addEmojiReaction(ctx, target, onebot, emojiId)
    }
  });

  //回复相同表情
  ctx.on('message', async (session) => {
    if (!config.reactSameEmoji)
      return;

    const onebot = getOneBot(session)
    if (!onebot) {
      if (config.verboseConsoleOutput) {
        ctx.logger.error("当前会话不支持onebot协议。");
      }
      return;
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
      if (element.attrs?.id) {
        if (config.verboseConsoleOutput)
          ctx.logger.info(`发现表情，回复相同表情，id=${element.attrs.id}`);
        await onebot._request(
          "set_group_reaction",
          {
            "group_id": target.groupId,
            "message_id": target.messageId,
            "code": element.attrs.id,
            "is_add": true
          }
        )
        await onebot._request(
          'set_msg_emoji_like',
          {
            message_id: target.messageId,
            emoji_id: element.attrs.id
          }
        )
      }
    }
  })

}
