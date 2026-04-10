import assert from 'node:assert/strict'
import test from 'node:test'

import { h } from 'koishi'

import { apply, Config as ConfigSchema, inject } from '../src/index'

function createContext() {
  const handlers: Array<(session: any) => Promise<void>> = []
  const requests: Array<{ action: string, params: Record<string, unknown> }> = []
  const logs: Array<{ level: 'info' | 'error', message: string }> = []
  const commands = new Map<string, (...args: any[]) => Promise<unknown>>()
  const extensions: Array<{ name: string, schema: any, options?: any }> = []
  const tables = new Map<string, any[]>()

  function matches(row: Record<string, unknown>, query: Record<string, unknown>) {
    return Object.entries(query).every(([key, value]) => row[key] === value)
  }

  function ensureTable(name: string) {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)!
  }

  function getPrimaryKey(name: string) {
    if (name === 'runtimeEmoji') return ['groupId', 'userId', 'emojiId'] as const
    return [] as const
  }

  const ctx = {
    logger: {
      info(message: string) {
        logs.push({ level: 'info', message })
      },
      error(message: string) {
        logs.push({ level: 'error', message })
      },
    },
    on(_event: string, handler: (session: any) => Promise<void>) {
      handlers.push(handler)
    },
    model: {
      extend(name: string, schema: any, options?: any) {
        extensions.push({ name, schema, options })
      },
    },
    database: {
      async get(name: string, query: Record<string, unknown>) {
        return ensureTable(name).filter(row => matches(row, query))
      },
      async create(name: string, data: Record<string, unknown> | Record<string, unknown>[]) {
        const rows = Array.isArray(data) ? data : [data]
        const primaryKey = getPrimaryKey(name)

        for (const row of rows) {
          if (primaryKey.length && ensureTable(name).some(existing =>
            primaryKey.every(key => existing[key] === row[key]),
          )) {
            throw new Error(`duplicate key for ${name}`)
          }
        }

        ensureTable(name).push(...rows)
        return Array.isArray(data) ? rows : rows[0]
      },
      async remove(name: string, query: Record<string, unknown>) {
        const rows = ensureTable(name)
        const remain = rows.filter(row => !matches(row, query))
        tables.set(name, remain)
        return { removed: rows.length - remain.length }
      },
    },
    command(name: string) {
      return {
        action(handler: (...args: any[]) => Promise<unknown>) {
          commands.set(name, handler)
          return this
        },
      }
    },
  }

  return { ctx, handlers, requests, logs, commands, extensions, tables }
}

function createSession(overrides: Partial<any> = {}) {
  const session = {
    userId: '42',
    channelId: '100',
    isDirect: false,
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

test('exports config schema and database injection metadata', () => {
  assert.ok(ConfigSchema)
  assert.deepEqual(inject, ['database'])
})

test('runtime emoji database failure is isolated from the message path', async () => {
  const { ctx, handlers, requests, logs } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: true,
  } as any)

  ctx.database.get = async () => {
    throw new Error('runtime emoji db unavailable')
  }

  await assert.doesNotReject(handlers[0](createSession({
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  })))

  assert.deepEqual(requests, [])
  assert.ok(logs.some(({ level, message }) =>
    level === 'error' && message.includes('读取自定义表情失败'),
  ))
  assert.ok(logs.some(({ level, message }) =>
    level === 'info' && message.includes('继续使用静态规则'),
  ))
})

test('verbose mode logs loaded runtime emoji ids and final merged ids', async () => {
  const { ctx, handlers, logs } = createContext()

  apply(ctx as any, {
    rules: [
      { groupIds: ['100'], userIds: ['42'], emojiIds: [111] },
    ],
    reactSameEmoji: false,
    verboseConsoleOutput: true,
  } as any)

  await ctx.database.create('runtimeEmoji', [
    { groupId: '100', userId: '42', emojiId: 222 },
    { groupId: '100', userId: '42', emojiId: 333 },
  ])

  await handlers[0](createSession({
    onebot: {
      async _request() {},
    },
  }))

  assert.ok(logs.some(({ level, message }) =>
    level === 'info' && message.includes('加载到运行时表情 ID: 222, 333'),
  ))
  assert.ok(logs.some(({ level, message }) =>
    level === 'info' && message.includes('最终用于分发的表情 ID: 111, 222, 333'),
  ))
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

test('set-emoji stores one runtime emoji for the current user and group', async () => {
  const { ctx, commands, extensions } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  assert.deepEqual(extensions, [
    {
      name: 'runtimeEmoji',
      schema: {
        groupId: 'string(255)',
        userId: 'string(255)',
        emojiId: 'unsigned(8)',
      },
      options: {
        primary: ['groupId', 'userId', 'emojiId'],
      },
    },
  ])

  const setEmoji = commands.get('set-emoji <emojiId:number>')
  assert.ok(setEmoji)

  await setEmoji!({ session: createSession() }, 111)

  assert.deepEqual(await ctx.database.get('runtimeEmoji', { groupId: '100', userId: '42' }), [
    { groupId: '100', userId: '42', emojiId: 111 },
  ])
})

test('set-emoji rejects private sessions', async () => {
  const { ctx, commands } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  const setEmoji = commands.get('set-emoji <emojiId:number>')
  assert.ok(setEmoji)

  const result = await setEmoji!({ session: createSession({ isDirect: true }) }, 111)

  assert.equal(result, '仅能在群聊中设置自定义表情')
  assert.deepEqual(await ctx.database.get('runtimeEmoji', { groupId: '100', userId: '42' }), [])
})

test('set-emoji returns a duplicate message and does not create a second row', async () => {
  const { ctx, commands } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  const setEmoji = commands.get('set-emoji <emojiId:number>')
  assert.ok(setEmoji)

  const first = await setEmoji!({ session: createSession() }, 111)
  const second = await setEmoji!({ session: createSession() }, 111)

  assert.equal(first, '已添加自定义表情 111')
  assert.equal(second, '当前群和用户已经设置过自定义表情 111')
  assert.deepEqual(await ctx.database.get('runtimeEmoji', { groupId: '100', userId: '42', emojiId: 111 }), [
    { groupId: '100', userId: '42', emojiId: 111 },
  ])
})

test('rm-emoji removes only the matching emoji in the current group', async () => {
  const { ctx, commands } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  await ctx.database.create('runtimeEmoji', [
    { groupId: '100', userId: '42', emojiId: 111 },
    { groupId: '100', userId: '42', emojiId: 222 },
    { groupId: '200', userId: '42', emojiId: 111 },
    { groupId: '100', userId: '99', emojiId: 111 },
  ])

  const rmEmoji = commands.get('rm-emoji <emojiId:number>')
  assert.ok(rmEmoji)

  const result = await rmEmoji!({ session: createSession() }, 111)

  assert.equal(result, '已移除当前群和用户的自定义表情 111')
  assert.deepEqual(await ctx.database.get('runtimeEmoji', { groupId: '100', userId: '42' }), [
    { groupId: '100', userId: '42', emojiId: 222 },
  ])
  assert.deepEqual(await ctx.database.get('runtimeEmoji', { groupId: '200', userId: '42' }), [
    { groupId: '200', userId: '42', emojiId: 111 },
  ])
  assert.deepEqual(await ctx.database.get('runtimeEmoji', { groupId: '100', userId: '99' }), [
    { groupId: '100', userId: '99', emojiId: 111 },
  ])
})

test('clear-emoji removes all runtime emoji for the current user in the current group', async () => {
  const { ctx, commands } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  await ctx.database.create('runtimeEmoji', [
    { groupId: '100', userId: '42', emojiId: 111 },
    { groupId: '100', userId: '42', emojiId: 222 },
    { groupId: '200', userId: '42', emojiId: 333 },
    { groupId: '100', userId: '99', emojiId: 444 },
  ])

  const clearEmoji = commands.get('clear-emoji')
  assert.ok(clearEmoji)

  const result = await clearEmoji!({ session: createSession() })

  assert.equal(result, '已清空当前群和用户的自定义表情，共 2 个')
  assert.deepEqual(await ctx.database.remove('runtimeEmoji', { groupId: '100', userId: '42' }), { removed: 0 })
  assert.deepEqual(await ctx.database.get('runtimeEmoji', { groupId: '100', userId: '42' }), [])
  assert.deepEqual(await ctx.database.get('runtimeEmoji', { groupId: '200', userId: '42' }), [
    { groupId: '200', userId: '42', emojiId: 333 },
  ])
  assert.deepEqual(await ctx.database.get('runtimeEmoji', { groupId: '100', userId: '99' }), [
    { groupId: '100', userId: '99', emojiId: 444 },
  ])
})

test('rm-emoji reports when the emoji is missing', async () => {
  const { ctx, commands } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  const rmEmoji = commands.get('rm-emoji <emojiId:number>')
  assert.ok(rmEmoji)

  const result = await rmEmoji!({ session: createSession() }, 111)

  assert.equal(result, '当前群和用户没有设置自定义表情 111')
})

test('rm-emoji rejects private sessions', async () => {
  const { ctx, commands } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  const rmEmoji = commands.get('rm-emoji <emojiId:number>')
  assert.ok(rmEmoji)

  const result = await rmEmoji!({ session: createSession({ isDirect: true }) }, 111)

  assert.equal(result, '仅能在群聊中管理自定义表情')
})

test('clear-emoji reports when nothing is configured', async () => {
  const { ctx, commands } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  const clearEmoji = commands.get('clear-emoji')
  assert.ok(clearEmoji)

  const result = await clearEmoji!({ session: createSession() })

  assert.equal(result, '当前群和用户没有自定义表情可清空')
})

test('clear-emoji rejects private sessions', async () => {
  const { ctx, commands } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  const clearEmoji = commands.get('clear-emoji')
  assert.ok(clearEmoji)

  const result = await clearEmoji!({ session: createSession({ isDirect: true }) })

  assert.equal(result, '仅能在群聊中管理自定义表情')
})

test('runtime emoji and static rules merge without duplicate dispatches', async () => {
  const { ctx, handlers, commands, requests } = createContext()

  apply(ctx as any, {
    rules: [
      { groupIds: ['100'], userIds: ['42'], emojiIds: [111, 222] },
    ],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  const setEmoji = commands.get('set-emoji <emojiId:number>')
  assert.ok(setEmoji)

  await setEmoji!({ session: createSession() }, 222)

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
  ])
})

test('runtime emoji only applies in the group where it was configured', async () => {
  const { ctx, handlers, commands, requests } = createContext()

  apply(ctx as any, {
    rules: [],
    reactSameEmoji: false,
    verboseConsoleOutput: false,
  } as any)

  const setEmoji = commands.get('set-emoji <emojiId:number>')
  assert.ok(setEmoji)

  await setEmoji!({ session: createSession() }, 333)
  await ctx.database.create('runtimeEmoji', {
    groupId: '100',
    userId: '42',
    emojiId: 444,
  })

  await handlers[0](createSession({
    messageId: 'msg-2',
    event: { message: { id: 'msg-2', content: 'hello' } },
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  }))

  await handlers[0](createSession({
    channelId: '200',
    messageId: 'msg-3',
    event: { message: { id: 'msg-3', content: 'hello' } },
    onebot: {
      async _request(action: string, params: Record<string, unknown>) {
        requests.push({ action, params })
      },
    },
  }))

  assert.deepEqual(requests, [
    {
      action: 'set_group_reaction',
      params: { group_id: '100', message_id: 'msg-2', code: '333', is_add: true },
    },
    {
      action: 'set_msg_emoji_like',
      params: { message_id: 'msg-2', emoji_id: 333 },
    },
    {
      action: 'set_group_reaction',
      params: { group_id: '100', message_id: 'msg-2', code: '444', is_add: true },
    },
    {
      action: 'set_msg_emoji_like',
      params: { message_id: 'msg-2', emoji_id: 444 },
    },
  ])
})
