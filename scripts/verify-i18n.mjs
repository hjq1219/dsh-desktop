// scripts/verify-i18n.mjs — 通过 Chrome DevTools 协议验证界面汉化器。
// 检查：语言探针（新建会话按钮）、真实按钮中是否还有未汉化的标签、
// 注入英文 fixtures（菜单项/选项/按钮）后是否被替换为中文。
// 用法：node scripts/verify-i18n.mjs <调试端口>
const port = Number(process.argv[2] ?? '9223')

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find(target => target.type === 'page')
if (page === undefined) {
  console.error('no page target')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
const call = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq
  pending.set(id, resolve)
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const reply = await call('Runtime.evaluate', { expression, returnByValue: true })
  return reply.result?.result?.value
}

console.log('=== 1) 语言探针 ===')
console.log(JSON.stringify(await evaluate(`(() => {
  const btns = [...document.querySelectorAll('button')]
  return {
    zhMarker: btns.some(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === '新建会话'),
    enMarker: btns.some(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === 'New session'),
  }
})()`), null, 2))

console.log('=== 2) 真实界面残留英文标签（应只剩 fixtures 注入前为 0 相关） ===')
console.log(JSON.stringify(await evaluate(`(() => {
  const leftovers = []
  for (const b of document.querySelectorAll('button')) {
    const t = (b.textContent ?? '').trim()
    if (t === 'Session log') leftovers.push('button: Session log')
  }
  return leftovers
})()`), null, 2))

console.log('=== 3) 注入 fixtures 并验证替换 ===')
await evaluate(`(() => {
  const mk = (role, text) => {
    const d = document.createElement('div')
    d.setAttribute('role', role)
    const s = document.createElement('span')
    s.textContent = text
    d.appendChild(s)
    document.body.appendChild(d)
  }
  const mkButton = (text) => {
    const b = document.createElement('button')
    b.textContent = text
    document.body.appendChild(b)
  }
  mk('menuitem', 'Read Only')
  mk('menuitemradio', 'High')
  mk('option', 'Max')
  mkButton('Workspace Write')
  mkButton('Full access')
  return 'injected'
})()`)
await new Promise(resolve => setTimeout(resolve, 800))
console.log(JSON.stringify(await evaluate(`[...document.querySelectorAll(
  'div[role="menuitem"], div[role="menuitemradio"], div[role="option"]'
)].map(d => d.textContent.trim()).concat(
  [...document.querySelectorAll('button')].map(b => b.textContent.trim())
    .filter(t => ['Workspace Write', 'Full access', '工作区可写', '完全访问'].includes(t))
)`), null, 2))

ws.close()
