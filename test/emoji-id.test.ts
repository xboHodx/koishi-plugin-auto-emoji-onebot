import assert from 'node:assert/strict'
import test from 'node:test'

import { apply } from '../src/index'

test('uses configured emojiId for automatic reaction requests', async () => {
  const handlers: Array<(session: any) => Promise<void>> = []
  const requests: Array<{ action: string, params: Record<string, unknown> }> = []

  const ctx = {
    logger: { info() {}, error() {} },
    on(_event: string, handler: (session: any) => Promise<void>) {
      handlers.push(handler)
    },
  }

  apply(ctx as any, {
    reactUserIdList: ['42'],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
    emojiId: 777,
  } as any)

  await handlers[0]({
    userId: '42',
    channelId: '100',
    messageId: 'msg-1',
    content: 'hello',
    event: { message: { id: 'msg-1', content: 'hello' } },
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  })

  assert.deepEqual(requests, [
    {
      action: 'set_group_reaction',
      params: { group_id: '100', message_id: 'msg-1', code: '777', is_add: true },
    },
    {
      action: 'set_msg_emoji_like',
      params: { message_id: 'msg-1', emoji_id: 777 },
    },
  ])
})
