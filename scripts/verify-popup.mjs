// scripts/verify-popup.mjs — 通过 Chrome DevTools 协议检查/操作运行中界面的弹窗。
// 仅用于本地验证：inspect 读取弹窗状态，click 点击弹窗主按钮，
// inject-en 注入一个英文标题的假弹窗以验证英文文案分支。
// 用法：node scripts/verify-popup.mjs <调试端口> <inspect|click|inject-en>
const port = Number(process.argv[2] ?? '9223')
const action = process.argv[3] ?? 'inspect'

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
const snapshot = () => evaluate(`(() => {
  const d = document.querySelector('[role="dialog"]')
  if (!d) return { state: 'NO_DIALOG' }
  const link = d.querySelector('a')
  return {
    state: 'DIALOG',
    title: d.querySelector('h2')?.textContent ?? null,
    paragraphs: [...d.querySelectorAll('p')].map(p => p.textContent),
    link: link ? { text: link.textContent, href: link.getAttribute('href'), target: link.getAttribute('target') } : null,
    button: d.querySelector('button')?.textContent ?? null,
  }
})()`)

if (action === 'inspect') {
  console.log(JSON.stringify(await snapshot(), null, 2))
} else if (action === 'click') {
  const clicked = await evaluate(`(() => {
    const b = document.querySelector('[role="dialog"]')?.querySelector('button')
    if (!b) return false
    b.click()
    return true
  })()`)
  console.log('clicked:', clicked)
  await new Promise(resolve => setTimeout(resolve, 1500))
  console.log(JSON.stringify(await snapshot(), null, 2))
} else if (action === 'inject-en') {
  await evaluate(`(() => {
    const d = document.createElement('div')
    d.setAttribute('role', 'dialog')
    const h = document.createElement('h2')
    h.textContent = 'Internal Testing Notice'
    d.appendChild(h)
    const p = document.createElement('p')
    p.textContent = 'official english placeholder'
    d.appendChild(p)
    document.body.appendChild(d)
    return 'injected'
  })()`)
  await new Promise(resolve => setTimeout(resolve, 800))
  console.log(JSON.stringify(await snapshot(), null, 2))
} else {
  console.error('unknown action:', action)
  process.exit(1)
}
ws.close()
