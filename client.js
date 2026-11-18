/**
 * dsh-chat-search — Client half.
 *
 * The Host already indexes message content (`ctx.sessions.search`), so this file is
 * only the WeChat-style surface on top of it: a header search button (and ⌘/Ctrl+K),
 * an overlay with a query box, results grouped by conversation with the hit
 * highlighted, and Enter/click to open that conversation.
 */
window.__ModuleLoader__.load({
  id: 'dsh-chat-search',
  factory(require) {
    const React = require('react')
    const NS = 'dsh-chat-search'

    const ICON =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>'

    const STYLES = [
      '[data-dsh-cs-btn]{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;',
      'padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '[data-dsh-cs-btn]:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '[data-dsh-cs-btn] svg{display:block;width:16px;height:16px}',
      '.dsh-cs-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;justify-content:center;align-items:flex-start;',
      'padding:11vh 16px 16px;background:rgba(0,0,0,.38)}',
      '.dsh-cs-panel{width:min(780px,94vw);max-height:70vh;display:flex;flex-direction:column;overflow:hidden;',
      'background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;',
      'box-shadow:0 24px 60px rgba(0,0,0,.42)}',
      '.dsh-cs-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-cs-head svg{flex:none;width:16px;height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.dsh-cs-input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);',
      'font:inherit;font-size:14px;line-height:20px}',
      '.dsh-cs-kbd{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l1);',
      'border-radius:4px;padding:1px 5px}',
      '.dsh-cs-status{padding:10px 14px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-cs-results{overflow:auto;padding:4px 6px 8px}',
      '.dsh-cs-group{margin-top:6px}',
      '.dsh-cs-group-title{display:flex;align-items:baseline;gap:8px;padding:6px 10px 4px;font-size:12px;font-weight:600;',
      'color:var(--dsw-alias-label-secondary)}',
      '.dsh-cs-group-meta{font-weight:400;color:var(--dsw-alias-label-tertiary);font-size:11px;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsh-cs-hit{display:block;width:100%;box-sizing:border-box;text-align:left;border:0;border-radius:8px;',
      'padding:8px 10px;margin:1px 0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;',
      'font-size:13px;line-height:20px;cursor:pointer}',
      '.dsh-cs-hit:hover,.dsh-cs-hit[data-active]{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-cs-hit-text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-cs-hit mark{background:var(--dsw-alias-state-business-tertiary,rgba(90,160,255,.35));color:inherit;border-radius:2px;padding:0 1px}',
      '@media (prefers-reduced-motion:no-preference){.dsh-cs-panel{animation:dsh-cs-in .12s ease-out}}',
      '@keyframes dsh-cs-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
    ].join('')

    function installStyles() {
      const tag = document.createElement('style')
      tag.dataset.dshChatSearch = '1'
      tag.textContent = STYLES
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    /** One session's display title, from the client session list snapshot. */
    function titleOf(sessions, sessionId) {
      try {
        const state = sessions && sessions.list ? sessions.list.getSnapshot() : null
        if (state === null || state === undefined) return ''
        const summary = state.byId ? state.byId[sessionId] : null
        if (summary !== null && summary !== undefined) {
          if (typeof summary.title === 'string' && summary.title !== '') return summary.title
          if (typeof summary.name === 'string' && summary.name !== '') return summary.name
        }
        // Titles also live in the per-session projection snapshot.
        const projections = state.projectionsBySession ? state.projectionsBySession[sessionId] : null
        const values = projections && projections.values ? projections.values : null
        const title = values && values.title
        if (typeof title === 'string' && title !== '') return title
        return ''
      } catch (error) {
        return ''
      }
    }

    /**
     * The overlay. Built imperatively so the plugin needs nothing beyond React:
     * `open()` mounts it, Escape/backdrop closes it, results render from the Host
     * search index on a debounce.
     */
    function createSearchUi(ctx, t) {
      let backdrop = null
      let input = null
      let status = null
      let results = null
      let timer = 0
      let controller = null
      let rows = []
      let active = -1

      const sessionsOf = () => (typeof ctx.get === 'function' ? ctx.get('sessions') : ctx.sessions)
      const workspaceOf = () => (typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : ctx.uiWorkspace)

      function setStatus(text) {
        if (status === null) return
        status.textContent = text === '' ? '' : text
        status.style.display = text === '' ? 'none' : 'block'
      }

      function highlight(text, query) {
        const fragment = document.createDocumentFragment()
        const needle = query.toLowerCase()
        const haystack = text.toLowerCase()
        let from = 0
        for (;;) {
          const at = haystack.indexOf(needle, from)
          if (at < 0 || needle === '') {
            fragment.appendChild(document.createTextNode(text.slice(from)))
            break
          }
          if (at > from) fragment.appendChild(document.createTextNode(text.slice(from, at)))
          const mark = document.createElement('mark')
          mark.textContent = text.slice(at, at + needle.length)
          fragment.appendChild(mark)
          from = at + needle.length
        }
        return fragment
      }

      function setActive(next) {
        if (rows.length === 0) return
        active = (next + rows.length) % rows.length
        rows.forEach((row, index) => {
          if (index === active) row.dataset.active = '1'
          else delete row.dataset.active
        })
        const row = rows[active]
        if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
      }

      function openSessionAt(index) {
        const row = rows[index]
        if (!row) return
        const id = row.dataset.sessionId
        close()
        try {
          const workspace = workspaceOf()
          if (workspace && typeof workspace.openSession === 'function') workspace.openSession(id)
        } catch (error) {
          console.error('[dsh-chat-search] open session failed', error)
        }
      }

      function render(items, hasMore, query) {
        results.textContent = ''
        rows = []
        active = -1
        if (items.length === 0) {
          setStatus(t('empty'))
          return
        }
        setStatus(hasMore ? t('more').replace('{n}', String(items.length)) : '')
        const sessions = sessionsOf()
        const groups = new Map()
        for (const item of items) {
          const key = String(item.sessionId)
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key).push(item)
        }
        for (const [sessionId, hits] of groups) {
          const group = document.createElement('div')
          group.className = 'dsh-cs-group'
          const head = document.createElement('div')
          head.className = 'dsh-cs-group-title'
          const name = document.createElement('span')
          name.textContent = titleOf(sessions, sessionId) || t('untitled')
          const meta = document.createElement('span')
          meta.className = 'dsh-cs-group-meta'
          meta.textContent = t('hits').replace('{n}', String(hits.length))
          head.appendChild(name)
          head.appendChild(meta)
          group.appendChild(head)
          for (const hit of hits) {
            const row = document.createElement('button')
            row.type = 'button'
            row.className = 'dsh-cs-hit'
            row.dataset.sessionId = sessionId
            const text = document.createElement('span')
            text.className = 'dsh-cs-hit-text'
            text.appendChild(highlight(String(hit.snippet || '').replace(/\s+/g, ' ').trim(), query))
            row.appendChild(text)
            const index = rows.length
            row.addEventListener('click', () => openSessionAt(index))
            row.addEventListener('mouseenter', () => setActive(index))
            rows.push(row)
            group.appendChild(row)
          }
          results.appendChild(group)
        }
        setActive(0)
      }

      async function runSearch(query) {
        const sessions = sessionsOf()
        if (!sessions || typeof sessions.search !== 'function') {
          setStatus(t('unavailable'))
          return
        }
        if (controller !== null) controller.abort()
        controller = new AbortController()
        const signal = controller.signal
        setStatus(t('searching'))
        try {
          const outcome = await sessions.search(query, signal)
          if (signal.aborted) return
          if (!outcome || outcome.ok !== true) {
            setStatus(t('failed'))
            return
          }
          render(outcome.value.items || [], outcome.value.hasMore === true, query)
        } catch (error) {
          if (!signal.aborted) setStatus(t('failed'))
        }
      }

      function onQuery() {
        const query = input.value.trim()
        clearTimeout(timer)
        if (query === '') {
          results.textContent = ''
          rows = []
          setStatus('')
          return
        }
        timer = setTimeout(() => {
          void runSearch(query)
        }, 200)
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
          return
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActive(active + 1)
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActive(active - 1)
          return
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          openSessionAt(active)
        }
      }

      function build() {
        backdrop = document.createElement('div')
        backdrop.className = 'dsh-cs-backdrop'
        backdrop.addEventListener('mousedown', (event) => {
          if (event.target === backdrop) close()
        })
        const panel = document.createElement('div')
        panel.className = 'dsh-cs-panel'
        const head = document.createElement('div')
        head.className = 'dsh-cs-head'
        const glyph = document.createElement('span')
        glyph.innerHTML = ICON
        input = document.createElement('input')
        input.className = 'dsh-cs-input'
        input.type = 'text'
        input.placeholder = t('placeholder')
        input.setAttribute('aria-label', t('placeholder'))
        input.addEventListener('input', onQuery)
        input.addEventListener('keydown', onKeyDown)
        const kbd = document.createElement('span')
        kbd.className = 'dsh-cs-kbd'
        kbd.textContent = 'Esc'
        head.appendChild(glyph)
        head.appendChild(input)
        head.appendChild(kbd)
        status = document.createElement('div')
        status.className = 'dsh-cs-status'
        status.style.display = 'none'
        results = document.createElement('div')
        results.className = 'dsh-cs-results'
        panel.appendChild(head)
        panel.appendChild(status)
        panel.appendChild(results)
        backdrop.appendChild(panel)
        document.body.appendChild(backdrop)
      }

      function open() {
        if (backdrop === null) build()
        backdrop.style.display = 'flex'
        input.value = ''
        input.focus()
        results.textContent = ''
        rows = []
        active = -1
        setStatus('')
      }

      function close() {
        if (backdrop !== null) backdrop.style.display = 'none'
        if (controller !== null) {
          controller.abort()
          controller = null
        }
        clearTimeout(timer)
      }

      function destroy() {
        close()
        if (backdrop !== null && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop)
        backdrop = null
        input = null
        status = null
        results = null
        rows = []
      }

      return { open, close, destroy, isOpen: () => backdrop !== null && backdrop.style.display !== 'none' }
    }

    function SearchButton(props) {
      return React.createElement(
        'button',
        {
          type: 'button',
          'data-dsh-cs-btn': '1',
          title: props.label,
          'aria-label': props.label,
          onClick: props.onOpen,
          dangerouslySetInnerHTML: { __html: ICON },
        },
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => installStyles(), 'dsh-chat-search: styles')
        ctx.effect(
          () =>
            ctx.locale.register(NS, {
              zh: {
                label: '搜索聊天记录',
                placeholder: '搜索所有会话…',
                searching: '搜索中…',
                empty: '没有匹配的消息',
                failed: '搜索失败',
                unavailable: '当前环境不支持搜索',
                untitled: '未命名会话',
                hits: '{n} 条',
                more: '只显示前 {n} 条，输入更精确的关键词可以缩小范围',
              },
              en: {
                label: 'Search conversations',
                placeholder: 'Search all conversations…',
                searching: 'Searching…',
                empty: 'No matching messages',
                failed: 'Search failed',
                unavailable: 'Search is unavailable here',
                untitled: 'Untitled conversation',
                hits: '{n} hits',
                more: 'Showing the first {n} hits — narrow the query to see more',
              },
            }),
          'dsh-chat-search: dictionaries',
        )
        const t = ctx.locale.bind(NS)
        const ui = createSearchUi(ctx, t)

        ctx.effect(
          () => () => ui.destroy(),
          'dsh-chat-search: teardown',
        )

        ctx.effect(
          () =>
            ctx.slots.inject('conversation.session.header.utilities', () =>
              ctx.slots.register(
                { name: 'conversation.session.header.utilities', id: 'chat-search', order: 20 },
                () => React.createElement(SearchButton, { label: t('label'), onOpen: () => ui.open() }),
              ),
            ),
          'dsh-chat-search: header button',
        )

        // ⌘K / Ctrl+K anywhere opens the same overlay.
        ctx.effect(() => {
          const onKey = (event) => {
            if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
              event.preventDefault()
              event.stopPropagation()
              ui.open()
            }
          }
          document.addEventListener('keydown', onKey, true)
          return () => document.removeEventListener('keydown', onKey, true)
        }, 'dsh-chat-search: shortcut')
      },
    }
  },
})
