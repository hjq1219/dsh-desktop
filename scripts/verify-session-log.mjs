// scripts/verify-session-log.mjs — 通过 CDP 发一条消息开启真实会话，
// 然后检查右上角 Session log 下载按钮是否已汉化为「会话日志」。
// 用法：node scripts/verify-session-log.mjs <调试端口>
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

const focused = await evaluate(`(() => {
  const textarea = document.querySelector('textarea')
  if (!textarea) return false
  textarea.focus()
  return true
})()`)
console.log('textarea focused:', focused)
if (!focused) {
  ws.close()
  process.exit(1)
}

await call('Input.insertText', { text: '你好' })
await new Promise(resolve => setTimeout(resolve, 500))

const sent = await evaluate(`(() => {
  const send = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '发送消息')
  if (!send) return false
  send.click()
  return true
})()`)
console.log('send clicked:', sent)

await new Promise(resolve => setTimeout(resolve, 4000))

const result = await evaluate(`(() => {
  const labels = [...document.querySelectorAll('button')]
    .map(b => ({ text: (b.textContent ?? '').trim(), aria: b.getAttribute('aria-label') ?? '' }))
    .filter(b => b.text.includes('会话日志') || b.text.includes('Session log') || b.aria.includes('会话日志') || b.aria.includes('Session log'))
  return labels
})()`)
console.log('Session log 按钮状态:', JSON.stringify(result, null, 2))
ws.close()
