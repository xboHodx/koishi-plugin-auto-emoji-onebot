import { Context, Schema } from 'koishi'
import {} from 'koishi-plugin-adapter-onebot';

export const name = 'auto-emoji-onebot'

export interface Config {
  reactUserIdList: string[];
  verboseConsoleOutput: boolean;
}

export const Config: Schema<Config> = Schema.intersect([

  Schema.object({
    reactUserIdList: Schema.array(String)
    .default(["1830540513"])
    .description("")
  }).description("基础设置"),

  Schema.object({
    verboseConsoleOutput: Schema.boolean()
    .default(false),
  }).description("debug"),
])

export function apply(ctx: Context, config: Config) {

  ctx.on('message', async (session) => {

    if (!config.reactUserIdList.includes(session.userId)) {
      if (config.verboseConsoleOutput) {
        ctx.logger.info(`用户id ${session.userId} 不在列表中，跳过。`);
      }
      return;
    }

    if (!session.onebot) {
      if (config.verboseConsoleOutput) {
        ctx.logger.error("当前会话不支持onebot协议。");
      }
      return;
    }

    if ( config.verboseConsoleOutput ) {
      ctx.logger.info(`尝试对用户 ${session.userId} 的消息添加表情。消息内容: ${session.event.message.content.slice(0,10)}`);
    }

    await session.onebot._request(
      "set_group_reaction",
      {
        "group_id": session.channelId,
        "message_id": session.event.message.id,
        "code": "324", 
        "is_add": true
      }
    ).catch((err) => {
      ctx.logger.error(`lagrange添加表情失败: ${err.message}`);
    })

    await session.onebot._request(
      "set_msg_emoji_like",
      {
        "group_id": session.channelId,
        "message_id": session.event.message.id,
        "code": "324", 
        "is_add": true
      }
    ).catch((err) => {
      ctx.logger.error(`napcat添加表情失败: ${err.message}`);
    })
    
  });

}
