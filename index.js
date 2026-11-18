/**
 * dsh-chat-search — 关键词搜聊天记录。
 *
 * 宿主侧已经有消息内容索引（`ctx.sessions.search(query)`），这里只做界面：会话顶栏
 * 一个搜索按钮（或 Ctrl/⌘+K），弹出输入框，结果按会话分组、命中处高亮，回车/点击
 * 直接跳到那条会话。
 *
 * @module dsh-chat-search
 */

export const name = 'dsh-chat-search'

/** The Client half owns everything; the Host row exists so the bundle mounts. */
export function apply() {}
