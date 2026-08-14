/**
 * DeepSeek Harness 桌面外壳（Electron 主进程）。
 *
 * 职责只有三件事：
 * 1. 用 Electron 自带的 Node 运行时拉起本地 `dsh web --port 0`（端口由系统分配，
 *    不会与终端里手动运行的 3080 实例冲突）；
 * 2. 从服务就绪输出中解析出实际 URL；
 * 3. 在独立应用窗口里加载该 URL；退出应用时顺带停掉服务。
 *
 * 对 DeepSeek Harness 本身零侵入：这个文件只是 `dsh web` 的一个壳。
 */
import { app, BrowserWindow, dialog, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** dsh 的 CLI 入口；作为生产依赖随 app 一起分发。 */
const DSH_BIN = path.join(here, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

/** 服务就绪等待上限：首次启动要做会话持久化等初始化，给足余量。 */
const BOOT_TIMEOUT_MS = 90_000

/** dsh 就绪行样例：`dsh web: http://127.0.0.1:38471 (LAN: ...)`。 */
const READY_RE = /dsh web:\s+(https?:\/\/[^\s]+)/

/** @type {BrowserWindow | null} */
let mainWindow = null
/** @type {string | null} 服务就绪后解析出的实际 URL。 */
let readyUrl = null
/** @type {import('node:child_process').ChildProcess | null} */
let server = null
/** 用户主动退出（Cmd+Q / 退出菜单）时置位，此时服务退出不弹错误框。 */
let quitting = false
/** 出错提示已弹过，避免 exit / error 双事件弹两个框。 */
let fatalShown = false
/** 最近的服务输出，出错时附在提示里。 */
let recentOutput = []

function showFatal(message) {
  if (fatalShown) return
  fatalShown = true
  const tail = recentOutput.join('')
  dialog.showErrorBox(
    'DeepSeek Harness',
    tail === '' ? message : `${message}\n\n服务输出（末尾）：\n${tail}`,
  )
  app.exit(1)
}

/** 拉起 dsh web 子进程并监听其就绪信号。 */
function startServer() {
  if (!existsSync(DSH_BIN)) {
    showFatal(`找不到 dsh 运行时：\n${DSH_BIN}\n请重新安装本应用。`)
    return
  }

  // ELECTRON_RUN_AS_NODE=1 让 Electron 二进制表现得像普通 Node：
  // 打包后的 app 自带这个运行时，用户机器上无需安装 Node。
  // --expose-internals 是 dsh 加载器需要的：在普通 Node 里它用原生扩展
  // node-addon-require-builtin 兜底，但该扩展依赖上游 Node 的 embedder
  // 符号，在 Electron 的 Node 里不可用；显式暴露内部模块即可让加载器
  // 走标准 require 路径。
  server = spawn(process.execPath, ['--expose-internals', DSH_BIN, 'web', '--port', '0'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*m/g, '')

  const remember = (chunk) => {
    recentOutput.push(stripAnsi(String(chunk)))
    if (recentOutput.length > 80) recentOutput.shift()
  }

  const bootTimer = setTimeout(() => {
    showFatal('dsh 服务启动超时。')
  }, BOOT_TIMEOUT_MS)

  // 逐行扫描 stdout；URL 行可能被 chunk 边界切断，用 pending 拼完整行再匹配。
  let pending = ''
  const onData = (chunk) => {
    remember(chunk)
    pending += String(chunk)
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      const match = READY_RE.exec(stripAnsi(line))
      if (match !== null) {
        clearTimeout(bootTimer)
        readyUrl = match[1]
        server.stdout.off('data', onData)
        console.log(`[dsh-desktop] dsh web ready at ${readyUrl}`)
        createWindow()
        return
      }
    }
  }
  server.stdout.on('data', onData)
  server.stderr.on('data', remember)

  server.on('exit', (code, signal) => {
    server = null
    if (quitting) return
    const reason = code === null ? `信号 ${String(signal)}` : `退出码 ${String(code)}`
    showFatal(`dsh 服务意外退出（${reason}）。`)
  })

  server.on('error', (err) => {
    showFatal(`无法启动 dsh 服务：${err.message}`)
  })
}

/** 打开主窗口并加载服务 URL。 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: 'DeepSeek Harness',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 界面里的外链交给系统浏览器，不在应用内开新窗口。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadURL(readyUrl)
  win.on('closed', () => {
    mainWindow = null
  })
  mainWindow = win
}

if (!app.requestSingleInstanceLock()) {
  // 已有实例在运行：把启动请求转发过去（对方会激活已有窗口），本实例直接退出。
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    startServer()
    // macOS 惯例：窗口全关后应用常驻 Dock，点图标重新开窗。
    app.on('activate', () => {
      if (mainWindow === null && readyUrl !== null) createWindow()
    })
  })

  // 非 macOS：窗口全关 = 退出应用。
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    quitting = true
    if (server !== null) server.kill('SIGTERM')
  })
}
