import { Context, Schema } from 'koishi'
import {} from 'koishi-plugin-adapter-onebot';

export const name = 'auto-emoji-onebot'

export interface Config {
  reactUserIdList: string[];
}

export const Config: Schema<Config> = Schema.intersect([

  Schema.object({
    reactUserIdList: Schema.array(String)
    .default(["1830540513"]),
  })

])

export function apply(ctx: Context, config: Config) {

  ctx.on('message', async (session) => {

    if (!config.reactUserIdList.includes(session.userId)) {
      return;
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
      ctx.logger.error(`Failed to react with emoji: ${err.message}`);
    })
    
  });

}
