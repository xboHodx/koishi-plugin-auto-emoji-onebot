import assert from 'node:assert/strict'
import test from 'node:test'

import { h } from 'koishi'

import { apply } from '../src/index'

function createContext() {
  const handlers: Array<(session: any) => Promise<void>> = []
  const requests: Array<{ action: string, params: Record<string, unknown> }> = []

  const ctx = {
    logger: { info() {}, error() {} },
    on(_event: string, handler: (session: any) => Promise<void>) {
      handlers.push(handler)
    },
  }

  return { ctx, handlers, requests }
}

function createSession(overrides: Partial<any> = {}) {
  const session = {
    userId: '42',
    channelId: '100',
    messageId: 'msg-1',
    content: 'hello',
    event: { message: { id: 'msg-1', content: 'hello' } },
    onebot: {
      async _request(_action: string, _params: Record<string, unknown>) {},
    },
  }

  return { ...session, ...overrides }
}

test('applies every deduplicated emoji from all matching rules', async () => {
  const { ctx, handlers, requests } = createContext()

  apply(ctx as any, {
    rules: [
      { groupIds: ['100'], userIds: ['42'], emojiIds: [111, 222] },
      { groupIds: ['100'], userIds: ['42'], emojiIds: [222, 333] },
    ],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  await handlers[0](createSession({
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  }))

  assert.deepEqual(requests, [
    {
      action: 'set_group_reaction',
      params: { group_id: '100', message_id: 'msg-1', code: '111', is_add: true },
    },
    {
      action: 'set_msg_emoji_like',
      params: { message_id: 'msg-1', emoji_id: 111 },
    },
    {
      action: 'set_group_reaction',
      params: { group_id: '100', message_id: 'msg-1', code: '222', is_add: true },
    },
    {
      action: 'set_msg_emoji_like',
      params: { message_id: 'msg-1', emoji_id: 222 },
    },
    {
      action: 'set_group_reaction',
      params: { group_id: '100', message_id: 'msg-1', code: '333', is_add: true },
    },
    {
      action: 'set_msg_emoji_like',
      params: { message_id: 'msg-1', emoji_id: 333 },
    },
  ])
})

test('does not react when the group does not match', async () => {
  const { ctx, handlers, requests } = createContext()

  apply(ctx as any, {
    rules: [
      { groupIds: ['100'], userIds: ['42'], emojiIds: [111] },
    ],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  await handlers[0](createSession({
    channelId: '200',
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  }))

  assert.deepEqual(requests, [])
})

test('does not react when the user does not match', async () => {
  const { ctx, handlers, requests } = createContext()

  apply(ctx as any, {
    rules: [
      { groupIds: ['100'], userIds: ['42'], emojiIds: [111] },
    ],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  await handlers[0](createSession({
    userId: '99',
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  }))

  assert.deepEqual(requests, [])
})

test('reactSameEmoji remains independent from rules', async () => {
  const { ctx, handlers, requests } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: true,
    verboseConsoleOutput: false,
  } as any)

  await handlers[1](createSession({
    content: String(h('face', { id: '123' })),
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  }))

  assert.deepEqual(requests, [
    {
      action: 'set_group_reaction',
      params: { group_id: '100', message_id: 'msg-1', code: '123', is_add: true },
    },
    {
      action: 'set_msg_emoji_like',
      params: { message_id: 'msg-1', emoji_id: '123' },
    },
  ])
})

test('does not react when required message metadata is missing', async () => {
  const { ctx, handlers, requests } = createContext()

  apply(ctx as any, {
    rules: [
      { groupIds: ['100'], userIds: ['42'], emojiIds: [111] },
    ],
    reactSameEmoji: true,
    verboseConsoleOutput: false,
  } as any)

  await handlers[0](createSession({
    channelId: undefined,
    event: {},
    messageId: undefined,
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  }))

  await handlers[1](createSession({
    channelId: undefined,
    content: String(h('face', { id: '123' })),
    event: {},
    messageId: undefined,
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  }))

  assert.deepEqual(requests, [])
})
