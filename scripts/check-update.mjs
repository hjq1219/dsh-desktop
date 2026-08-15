// scripts/check-update.mjs — 检查 dsh 官方是否有新版本。
// 对比桌面端 package.json 钉住的 @deepseek-ai/dsh 版本与 npm 上的最新版本。
// 用法：node scripts/check-update.mjs（配合 ~/.zshrc 里的 dsh 函数，终端执行 dsh version）
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const pinned = (pkg.dependencies['@deepseek-ai/dsh'] ?? '').replace(/^\^/, '')

let latest
try {
  latest = execFileSync('npm', ['view', '@deepseek-ai/dsh', 'version'], {
    encoding: 'utf8',
    timeout: 20000,
  }).trim().split('\n').pop().trim()
} catch (error) {
  console.error('✗ 无法查询 npm（网络不可用或 npm 不在 PATH）：', error.message)
  process.exit(1)
}

console.log(`桌面端当前 dsh 版本: ${pinned}`)
console.log(`npm 最新 dsh 版本:   ${latest}`)
if (pinned !== latest) {
  console.log('\n↑ 有新版本！升级流程：')
  console.log('  1. 修改 package.json 中 @deepseek-ai/dsh 与 19 个 dsh-* 包为新版本')
  console.log('  2. npm install && npm run pack')
  console.log('  3. node scripts/check-deps.mjs')
  console.log('  4. 本地回归（弹窗/汉化/密钥）后发版')
} else {
  console.log('\n✓ 已是最新版本，无需升级')
}
