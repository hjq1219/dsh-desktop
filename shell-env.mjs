/**
 * 从 ~/.zshrc 读取产品约定的 API 密钥变量 DEEPSEEK_HARNESS。
 *
 * macOS 图形应用由 launchd 启动，不经过用户的 shell，~/.zshrc 里的
 * `export` 对应用进程不可见。这里不执行 shell，只按行解析静态
 * `export NAME=...` 写法，提取 DEEPSEEK_HARNESS 这一个变量。
 * @module shell-env
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 产品约定：用户在 ~/.zshrc 中配置的 API 密钥变量名。 */
export const API_KEY_VAR = 'DEEPSEEK_HARNESS'

/** 单文件大小上限，超过视为异常文件跳过。 */
const MAX_RC_BYTES = 1024 * 1024

/** 解析 export 行右值：单引号、双引号、裸值；裸值剥掉「 # 注释」尾部。 */
export function parseShellValue(raw) {
  const value = raw.trim()
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1)
    if (end !== -1) return value.slice(1, end)
  }
  if (value.startsWith('"')) {
    const end = value.indexOf('"', 1)
    if (end !== -1) return value.slice(1, end).replace(/\\n/g, '\n').replace(/\\"/g, '"')
  }
  // 裸值：`#` 前有空白才视为注释，避免截断值内自带的 `#`。
  const hash = value.search(/\s+#/)
  return (hash === -1 ? value : value.slice(0, hash)).trim()
}

/**
 * 读取 ~/.zshrc 中的 {@link API_KEY_VAR} 配置值。
 * @param homeDir - 用户主目录，测试时可注入。
 * @returns 变量值；未配置时返回 undefined。
 */
export function readShellRcEnv(homeDir = os.homedir()) {
  const filePath = path.join(homeDir, '.zshrc')
  let text
  try {
    if (!existsSync(filePath)) return undefined
    if (statSync(filePath).size > MAX_RC_BYTES) return undefined
    text = readFileSync(filePath, 'utf8')
  } catch {
    return undefined
  }
  let value
  for (const line of text.split('\n')) {
    const match = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (match === null || match[1] !== API_KEY_VAR) continue
    value = parseShellValue(match[2])
  }
  return value
}
