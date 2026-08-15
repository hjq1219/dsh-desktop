// updater.mjs — 检查更新与半自动安装（GitHub Release）。
// 主进程模块：查询最新 Release、下载当前架构对应的 DMG、原生弹窗与 IPC。
// 界面文案由渲染层（preload）按界面语言决定后传入；网络失败通过 IPC
// 把错误交还渲染层展示。
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createWriteStream } from 'node:fs'
import path from 'node:path'

/** 检查更新与下载源的 GitHub 仓库。 */
const GITHUB_REPO = 'hjq1219/dsh-desktop'
/** 单次网络请求超时。 */
const REQUEST_TIMEOUT_MS = 8000

/** 当前应用版本。测试钩子：DSH_DESKTOP_CURRENT_VERSION 可覆盖，用于验证「有新版本」路径。 */
export function currentVersion() {
  return process.env.DSH_DESKTOP_CURRENT_VERSION ?? app.getVersion()
}

/** 比较两个版本号（忽略 v 前缀，逐段数值比较）；a > b 返回 true。 */
export function semverGt(a, b) {
  const parse = value => String(value).replace(/^v/, '').split('.').map(n => Number.parseInt(n, 10) || 0)
  const [left, right] = [parse(a), parse(b)]
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0)
    if (delta !== 0) return delta > 0
  }
  return false
}

/** 选择当前架构对应的 DMG 资产（arm64 取 -arm64.dmg，x64 取无后缀的）。 */
function pickAsset(assets, arch) {
  const dmgs = (assets ?? []).filter(a => typeof a.browser_download_url === 'string' && a.name.endsWith('.dmg'))
  if (dmgs.length === 0) return null
  if (arch === 'arm64') return dmgs.find(a => a.name.includes('arm64')) ?? dmgs[0]
  return dmgs.find(a => !a.name.includes('arm64')) ?? dmgs[0]
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-desktop' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/** 查询 GitHub 最新 Release 并与当前版本对比。失败时抛出异常。 */
export async function checkForUpdate() {
  const release = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
  const latest = String(release.tag_name ?? '').replace(/^v/, '')
  const current = currentVersion()
  const asset = pickAsset(release.assets, process.arch)
  return {
    current,
    latest,
    hasUpdate: latest !== '' && semverGt(latest, current),
    tag: release.tag_name ?? '',
    notes: String(release.body ?? '').slice(0, 400),
    htmlUrl: String(release.html_url ?? ''),
    asset: asset === null ? null : { name: asset.name, url: asset.browser_download_url },
  }
}

/**
 * 下载 DMG 到系统「下载」目录；进度通过 onProgress(received, total) 报告。
 * 测试钩子：DSH_DESKTOP_UPDATE_ASSET_URL / DSH_DESKTOP_UPDATE_ASSET_NAME
 * 可替换下载源（本地验证用小块文件）。
 */
export async function downloadDmg(asset, onProgress) {
  const url = process.env.DSH_DESKTOP_UPDATE_ASSET_URL ?? asset.url
  const filename = process.env.DSH_DESKTOP_UPDATE_ASSET_NAME ?? asset.name
  const dest = path.join(app.getPath('downloads'), filename)
  const response = await fetch(url, { headers: { 'User-Agent': 'dsh-desktop' }, redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const total = Number(response.headers.get('content-length') ?? 0)
  const file = createWriteStream(dest)
  let received = 0
  try {
    for await (const chunk of response.body) {
      received += chunk.length
      if (!file.write(chunk)) await new Promise(resolve => file.once('drain', resolve))
      onProgress(received, total)
    }
  } finally {
    file.end()
  }
  await new Promise((resolve, reject) => {
    file.on('finish', resolve)
    file.on('error', reject)
  })
  return dest
}

let startupResult = null

/** 注册渲染层可用的更新 IPC。 */
export function registerUpdaterIpc() {
  ipcMain.handle('dsh-update:check', async () => {
    try {
      const result = await checkForUpdate()
      console.log(`[dsh-desktop] update check: current=${result.current} latest=${result.latest} hasUpdate=${result.hasUpdate}`)
      return { ok: true, ...result }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('dsh-update:startup-status', async () => {
    if (startupResult === null) {
      startupResult = await checkForUpdate()
        .then(result => ({ ok: true, ...result }))
        .catch(error => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    }
    return startupResult
  })

  ipcMain.handle('dsh-update:download', async (event, asset) => {
    try {
      const dest = await downloadDmg(asset, (received, total) => {
        if (!event.sender.isDestroyed()) event.sender.send('dsh-update:progress', { received, total })
      })
      return { ok: true, path: dest }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 原生弹窗：文案由渲染层按界面语言传入（options 均为纯字符串）。
  ipcMain.handle('dsh-update:dialog', async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showMessageBox(win, {
      type: 'info',
      title: options.title,
      message: options.message,
      detail: options.detail ?? '',
      buttons: options.buttons,
      defaultId: options.defaultId ?? 0,
      cancelId: options.cancelId ?? options.buttons.length - 1,
    })
    return result.response
  })

  ipcMain.handle('dsh-update:open-path', async (_event, filePath) => {
    return shell.openPath(filePath)
  })

  ipcMain.handle('dsh-update:open-external', async (_event, url) => {
    await shell.openExternal(url)
  })
}

/** 启动后静默检查一次，结果缓存，由渲染层主动拉取；失败保持静默。 */
export function runStartupUpdateCheck() {
  setTimeout(() => {
    checkForUpdate()
      .then(result => { startupResult = { ok: true, ...result }; console.log(`[dsh-desktop] startup update check: current=${result.current} latest=${result.latest} hasUpdate=${result.hasUpdate}`) })
      .catch(() => { /* 静默：启动检查失败不打扰用户，下次再试 */ })
  }, 3000)
}
