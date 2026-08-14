// scripts/verify-menus.mjs — 通过 CDP 打开权限菜单与模型菜单，读取选项文案。
// 用于确认菜单打开后即显示汉化标签（配合肉眼确认无闪烁）。
// 用法：node scripts/verify-menus.mjs <调试端口>
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
const pressEscape = () => call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  .then(() => call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }))

const readMenus = () => evaluate(`(() => {
  const labels = [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]')]
    .map(el => el.textContent.trim())
    .filter(text => text !== '')
  return [...new Set(labels)].slice(0, 30)
})()`)

// 若有首次引导弹窗，先点掉
await evaluate(`(() => {
  const d = document.querySelector('[role="dialog"]')
  if (d && !d.querySelector('input, textarea')) {
    d.querySelector('button')?.click()
    return 'dismissed'
  }
  return 'none'
})()`)
await new Promise(resolve => setTimeout(resolve, 1000))

// 1) 权限菜单
const permClicked = await evaluate(`(() => {
  const trigger = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').startsWith('访问模式'))
  if (!trigger) return false
  trigger.click()
  return true
})()`)
console.log('权限菜单已打开:', permClicked)
if (permClicked) {
  await new Promise(resolve => setTimeout(resolve, 300))
  console.log('权限菜单选项:', JSON.stringify(await readMenus()))
  await pressEscape()
  await new Promise(resolve => setTimeout(resolve, 300))
}

// 2) 模型菜单
const modelClicked = await evaluate(`(() => {
  const trigger = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? '').startsWith('选择模型'))
  if (!trigger) return false
  trigger.click()
  return true
})()`)
console.log('模型菜单已打开:', modelClicked)
if (modelClicked) {
  await new Promise(resolve => setTimeout(resolve, 400))
  console.log('模型菜单初始选项:', JSON.stringify(await readMenus()))
  // 点「推理等级」栏目，展开等级选项
  const picked = await evaluate(`(() => {
    const entry = [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.includes('推理等级'))
    if (!entry) return false
    entry.click()
    return true
  })()`)
  console.log('已点开推理等级栏目:', picked)
  if (picked) {
    await new Promise(resolve => setTimeout(resolve, 500))
    console.log('选模型后菜单选项:', JSON.stringify(await readMenus()))
  }
  await pressEscape()
}

ws.close()
