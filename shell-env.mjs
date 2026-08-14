/**
 * 从 shell 启动文件里静态提取白名单环境变量。
 *
 * macOS 图形应用由 launchd 启动，不经过用户的 shell，~/.zshrc 等文件里的
 * `export` 对应用进程不可见。这里不做 shell 执行（不 source），只按行解析
 * 静态 `export NAME=...` 写法，把 harness 实际消费的少数变量注入 dsh 子进程。
 * @module shell-env
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 按 shell 加载顺序排列；后读到的覆盖先读到的（与 zsh 行为一致）。 */
const SHELL_RC_FILES = ['.zshenv', '.zprofile', '.zshrc', '.bash_profile', '.bashrc', '.profile']

/** 只提取 harness 消费的变量，其余一律不注入。 */
const WHITELIST = new Set(['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL'])

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
 * 读取常见 shell 启动文件中的白名单 export 变量。
 * @param homeDir - 用户主目录，测试时可注入。
 * @returns 变量名到值的映射；不存在的文件静默跳过。
 */
export function readShellRcEnv(homeDir = os.homedir()) {
  const values = {}
  for (const file of SHELL_RC_FILES) {
    const filePath = path.join(homeDir, file)
    let text
    try {
      if (!existsSync(filePath)) continue
      if (statSync(filePath).size > MAX_RC_BYTES) continue
      text = readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const match = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
      if (match === null) continue
      const name = match[1]
      if (!WHITELIST.has(name)) continue
      values[name] = parseShellValue(match[2])
    }
  }
  return values
}
