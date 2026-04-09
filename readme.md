# koishi-plugin-auto-emoji-onebot

[![npm](https://img.shields.io/npm/v/koishi-plugin-auto-emoji-onebot?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-auto-emoji-onebot)

按规则自动给指定群里的指定用户贴表情，支持一条消息贴多个表情；`reactSameEmoji` 仍然作为独立全局开关保留。

## 配置说明

- `rules`: 规则列表
- `rules[].groupIds`: 生效群号列表
- `rules[].userIds`: 生效用户列表
- `rules[].emojiIds`: 命中后需要全部添加的表情 ID 列表
- `reactSameEmoji`: 是否对消息里的表情回复相同表情
- `verboseConsoleOutput`: 是否输出调试日志

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
