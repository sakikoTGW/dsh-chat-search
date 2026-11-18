# dsh-chat-search

会话内关键词搜索 —— 像微信搜聊天记录那样：输入一个词，列出所有会话里命中的消息，
按会话分组，命中处高亮，点一条就跳到那条会话。

## 用法

- 会话顶栏右侧的 🔍 按钮
- 或 `Ctrl/Cmd + K`（任意位置）

打开后输入关键词（输入即搜，200ms 防抖）：

| 键 | 作用 |
|---|---|
| `↑` / `↓` | 在结果间移动 |
| `Enter` | 打开选中的会话 |
| `Esc` | 关闭 |

## 实现

检索本身用的是宿主已有的消息内容索引：

```js
const result = await ctx.sessions.search(query, signal)
// result.value = { items: [{ sessionId, snippet }], hasMore }
```

插件只做界面：会话标题来自 `ctx.sessions.list` 快照（`byId[].title`，回退到
`projectionsBySession[].values.title`），跳转用 `ctx.uiWorkspace.openSession(sessionId)`。

不写盘、不改检索结果、不注册宿主服务。
