/**
 * 从 assets/icon.png（1024×1024 源图）生成 macOS 应用图标 build/icon.icns。
 * 依赖 macOS 自带工具：sips 缩放出 iconset 的 10 档尺寸，iconutil 打包成 icns。
 * electron-builder 遇到现成的 icns 就不再下载图标转换工具，打包全程可离线。
 * 运行：npm run icon。换图标：替换 assets/icon.png 后重跑。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'assets', 'icon.png')
const outDir = path.join(root, 'build')
const iconsetDir = path.join(outDir, 'icon.iconset')

const ICONSET = [
  ['16x16', 16], ['16x16@2x', 32],
  ['32x32', 32], ['32x32@2x', 64],
  ['128x128', 128], ['128x128@2x', 256],
  ['256x256', 256], ['256x256@2x', 512],
  ['512x512', 512], ['512x512@2x', 1024],
]

mkdirSync(iconsetDir, { recursive: true })
for (const [name, size] of ICONSET) {
  execFileSync('sips', ['-z', String(size), String(size), src, '--out', path.join(iconsetDir, `icon_${name}.png`)], { stdio: 'ignore' })
}
const icns = path.join(outDir, 'icon.icns')
execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icns], { stdio: 'ignore' })
console.log(`icns written: ${icns} (from ${src})`)
