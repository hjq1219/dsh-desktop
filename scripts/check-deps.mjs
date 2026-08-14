// scripts/check-deps.mjs — 升级 dsh 版本后的打包完整性检查。
//
// 检查两件事：
// 1. 根 package.json 里显式声明的 @deepseek-ai/* 版本与已安装的 @deepseek-ai/dsh
//    版本是否同步（这些包随 dsh 一起发版，版本必须一致）；
// 2. 打包产物（dist/mac-arm64/.../app/node_modules）是否包含完整生产闭包
//    （dependencies + optionalDependencies + peerDependencies 可达的全部包）。
//    无打包产物时跳过第 2 项。
//
// 用法：node scripts/check-deps.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const NM = path.join(ROOT, 'node_modules')
const APP_NM = path.join(ROOT, 'dist', 'mac-arm64', 'DeepSeek Harness.app', 'Contents', 'Resources', 'app', 'node_modules')

function readPkg(dir) {
  try { return JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch { return null }
}

// 1. 版本同步检查
const root = readPkg(ROOT)
const installedDsh = readPkg(path.join(NM, '@deepseek-ai', 'dsh'))
let failed = false
if (root === null || installedDsh === null) {
  console.error('✗ 无法读取 package.json / 已安装的 @deepseek-ai/dsh')
  process.exit(1)
}
const dshVersion = installedDsh.version
console.log(`已安装 @deepseek-ai/dsh: ${dshVersion}`)
for (const [name, range] of Object.entries(root.dependencies ?? {})) {
  if (!name.startsWith('@deepseek-ai/')) continue
  const pkg = readPkg(path.join(NM, name))
  if (pkg === null) {
    console.error(`✗ ${name} 未安装（package.json 声明了但 node_modules 缺失，先 npm install）`)
    failed = true
  } else if (name.startsWith('@deepseek-ai/dsh-') && pkg.version !== dshVersion) {
    // dsh-* 系列随 dsh 一起发版；cordis-plugin-* 等有独立版本号体系。
    console.error(`✗ ${name} 版本不同步：package.json 声明 ${range}，已安装 ${pkg.version}，dsh 为 ${dshVersion}`)
    failed = true
  }
}
if (!failed) console.log('✓ @deepseek-ai/* 依赖已安装且 dsh-* 版本与 dsh 同步')

// 2. 打包闭包检查
if (!existsSync(APP_NM)) {
  console.log('(未找到打包产物，跳过闭包检查 —— 先执行打包)')
  process.exit(failed ? 1 : 0)
}

const closure = new Map()
const seen = new Set()
const queue = ['@deepseek-ai/dsh']
while (queue.length > 0) {
  const name = queue.shift()
  if (seen.has(name)) continue
  seen.add(name)
  const pkg = readPkg(path.join(NM, name))
  if (pkg === null) continue
  closure.set(name, pkg.version)
  for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const dep of Object.keys(pkg[key] ?? {})) queue.push(dep)
  }
}

const packaged = new Set()
function scan(dir, depth) {
  if (depth > 6) return
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const p = path.join(dir, entry.name)
    if (entry.name === 'node_modules' || entry.name.startsWith('@')) { scan(p, depth + 1); continue }
    if (existsSync(path.join(p, 'package.json'))) {
      try { packaged.add(JSON.parse(readFileSync(path.join(p, 'package.json'), 'utf8')).name) } catch { /* 忽略坏文件 */ }
      scan(path.join(p, 'node_modules'), depth + 1)
    }
  }
}
scan(APP_NM, 0)

const missing = [...closure.keys()].filter(name => !packaged.has(name)).sort()
if (missing.length > 0) {
  console.error(`✗ 打包产物缺失 ${missing.length} 个生产依赖：`)
  for (const name of missing) console.error(`  - ${name}`)
  failed = true
} else {
  console.log(`✓ 打包闭包完整（${closure.size} 个包）`)
}

process.exit(failed ? 1 : 0)
