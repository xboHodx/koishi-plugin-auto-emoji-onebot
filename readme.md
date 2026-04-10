# koishi-plugin-auto-emoji-onebot

[![npm](https://img.shields.io/npm/v/koishi-plugin-auto-emoji-onebot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-auto-emoji-onebot)

按规则自动给指定群里的指定用户贴表情，支持一条消息贴多个表情；`reactSameEmoji` 仍然作为独立全局开关保留。

除了静态 `rules` 之外，还支持运行时表情配置命令。运行时配置按「当前用户 + 当前群」保存，彼此独立，不会影响其他群，也不会影响其他用户的设置。

感谢 https://gitee.com/vincent-zyu/koishi-plugin-auto-emoji-onebot 的原始代码

## 配置说明

- `rules`: 规则列表
- `rules[].groupIds`: 生效群号列表
- `rules[].userIds`: 生效用户列表
- `rules[].emojiIds`: 命中后需要全部添加的表情 ID 列表
- `reactSameEmoji`: 是否对消息里的表情回复相同表情
- `verboseConsoleOutput`: 是否输出调试日志

## 运行时命令

以下命令都只在群聊中可用，并且只作用于当前用户在当前群里的运行时表情配置：

- `/set-emoji <emojiId:number>`: 追加一个运行时表情
- `/rm-emoji <emojiId:number>`: 移除当前用户在当前群里配置的某一个运行时表情
- `/clear-emoji`: 清空当前用户在当前群里的全部运行时表情

运行时配置和静态 `rules` 是两套独立来源，消息命中时会合并后去重再发送。

## 示例

```yaml
rules:
  - groupIds:
      - "123456"
      - "234567"
    userIds:
      - "111111"
      - "222222"
    emojiIds:
      - 324
      - 777
  - groupIds:
      - "345678"
    userIds:
      - "333333"
    emojiIds:
      - 66

reactSameEmoji: false
verboseConsoleOutput: false
```
