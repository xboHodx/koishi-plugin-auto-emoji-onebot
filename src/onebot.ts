import { Context, Session } from 'koishi'

export interface OneBotLike {
  _request(action: string, params: Record<string, unknown>): Promise<unknown>
}

type OneBotSession = Session & {
  onebot?: OneBotLike
}

export function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

export function getOneBot(session: Session) {
  const onebot = (session as OneBotSession).onebot
  if (onebot && typeof onebot._request === 'function') return onebot
}

export function getReactionTarget(session: Session) {
  const groupId = session.channelId
  const messageId = session.event.message?.id ?? session.messageId

  if (!groupId || !messageId) return

  return { groupId, messageId }
}

export async function addEmojiReaction(
  ctx: Context,
  target: { groupId: string; messageId: string },
  onebot: OneBotLike,
  emojiId: number,
) {
  // await onebot._request('set_group_reaction', {
  //   group_id: target.groupId,
  //   message_id: target.messageId,
  //   code: String(emojiId),
  //   is_add: true,
  // }).catch((err) => {
  //   ctx.logger.error(`lagrange添加表情失败: ${getErrorMessage(err)}`)
  // })

  await onebot._request('set_msg_emoji_like', {
    message_id: target.messageId,
    emoji_id: emojiId,
  }).catch((err) => {
    ctx.logger.error(`napcat添加表情失败: ${getErrorMessage(err)}`)
  })
}
