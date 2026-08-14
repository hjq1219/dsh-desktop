/**
 * 生成应用图标 build/icon.png（1024×1024 RGBA）。
 * 纯 Node 实现，零图像库依赖：手写 PNG 编码（签名 + IHDR/IDAT/IEND + CRC32），
 * 绘制「深蓝渐变圆角方块上的白色字母 H」（H = Harness）。
 * 运行：npm run icon。electron-builder 会把该 PNG 转成 .icns 打进 app。
 */
import { deflateSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 1024
const CX = SIZE / 2
const CY = SIZE / 2

// —— 背景：圆角方块 + 垂直渐变 ——
const HALF = 448
const RADIUS = 196
const TOP = [76, 110, 245] // #4C6EF5
const BOTTOM = [24, 39, 125] // #18277D

// —— 前景：白色字母 H（两根竖条 + 一根横杠）——
const WHITE = [255, 255, 255]
const BAR_HALF_W = 48
const BAR_INSET = 250
const BAR_HALF_H = 208
const CROSS_HALF_H = 42
const CROSS_HALF_W = BAR_INSET + BAR_HALF_W
const CORNER = 14

/** 圆角矩形覆盖度（带 1px 抗锯齿）：内部 1，外部 0。 */
function roundedRectAlpha(x, y, cx, cy, halfW, halfH, r) {
  const dx = Math.max(Math.abs(x - cx) - (halfW - r), 0)
  const dy = Math.max(Math.abs(y - cy) - (halfH - r), 0)
  const sd = Math.hypot(dx, dy) - r
  return Math.min(Math.max(0.5 - sd, 0), 1)
}

// 每行扫描线前缀一个 filter 字节（0 = None）。
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  const off = y * (SIZE * 4 + 1)
  raw[off] = 0
  for (let x = 0; x < SIZE; x++) {
    const px = x + 0.5
    const py = y + 0.5
    const bgA = roundedRectAlpha(px, py, CX, CY, HALF, HALF, RADIUS)
    const t = y / (SIZE - 1)
    let r = TOP[0] + (BOTTOM[0] - TOP[0]) * t
    let g = TOP[1] + (BOTTOM[1] - TOP[1]) * t
    let b = TOP[2] + (BOTTOM[2] - TOP[2]) * t
    const hA = Math.max(
      roundedRectAlpha(px, py, CX - BAR_INSET, CY, BAR_HALF_W, BAR_HALF_H, CORNER),
      roundedRectAlpha(px, py, CX + BAR_INSET, CY, BAR_HALF_W, BAR_HALF_H, CORNER),
      roundedRectAlpha(px, py, CX, CY, CROSS_HALF_W, CROSS_HALF_H, CORNER),
    )
    const a = hA + bgA * (1 - hA)
    if (a > 0) {
      r = (WHITE[0] * hA + r * bgA * (1 - hA)) / a
      g = (WHITE[1] * hA + g * bgA * (1 - hA)) / a
      b = (WHITE[2] * hA + b * bgA * (1 - hA)) / a
    }
    const o = off + 1 + x * 4
    raw[o] = Math.round(r)
    raw[o + 1] = Math.round(g)
    raw[o + 2] = Math.round(b)
    raw[o + 3] = Math.round(a * 255)
  }
}

// —— PNG 编码 ——
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

const IHDR = Buffer.alloc(13)
IHDR.writeUInt32BE(SIZE, 0)
IHDR.writeUInt32BE(SIZE, 4)
IHDR[8] = 8 // bit depth
IHDR[9] = 6 // color type: RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', IHDR),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png')
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`icon written: ${out} (${png.length} bytes)`)

// —— 用 macOS 自带工具生成 .icns ——
// electron-builder 遇到现成的 icns 就不再下载它的图标转换工具，
// 打包全程离线可用（sips 缩放 + iconutil 打包都是系统内置命令）。
const ICONSET = [
  ['16x16', 16], ['16x16@2x', 32],
  ['32x32', 32], ['32x32@2x', 64],
  ['128x128', 128], ['128x128@2x', 256],
  ['256x256', 256], ['256x256@2x', 512],
  ['512x512', 512], ['512x512@2x', 1024],
]
const iconsetDir = path.join(path.dirname(out), 'icon.iconset')
mkdirSync(iconsetDir, { recursive: true })
for (const [name, size] of ICONSET) {
  execFileSync('sips', ['-z', String(size), String(size), out, '--out', path.join(iconsetDir, `icon_${name}.png`)], { stdio: 'ignore' })
}
const icns = path.join(path.dirname(out), 'icon.icns')
execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icns], { stdio: 'ignore' })
console.log(`icns written: ${icns}`)
