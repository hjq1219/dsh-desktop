# DeepSeek Harness Desktop

把 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 的 Web 界面封装成 macOS 桌面应用：双击图标即用，不需要安装 Node、不需要终端、不需要浏览器。

## 工作原理

Electron 主进程（自带 Node 运行时）在应用内拉起 `dsh web --port 0`（端口由系统分配，与终端里手动运行的 3080 实例互不冲突），从就绪输出中解析实际地址，再在独立应用窗口里加载。对 harness 本身零修改，纯粹是一个「壳」。

- 数据目录 `~/.dsh` 与命令行用法共享：会话、配置、`.env` 全部通用。
- 退出应用（Cmd+Q）= 同时停掉服务。
- 关闭窗口（macOS 惯例）= 应用常驻 Dock，点图标重新开窗，秒开。
- 重复双击 = 聚焦已有窗口（单实例）。

## 开发运行

```sh
npm install   # 首次
npm run icon  # 把 assets/icon.png 转成 build/icon.icns（换图标后重跑）
npm start     # 开发模式直接跑
```

## 打包

```sh
npm run pack       # 只产出 .app（自己用，最快）：dist/mac*/DeepSeek Harness.app
npm run dist       # 产出当前架构的 .dmg
npm run dist:all   # 产出 arm64 + x64 两个 DMG（用于发布）
```

## 安装

1. 双击 `dist/*.dmg` → 把 DeepSeek Harness 拖进 Applications。
2. 首次打开：应用没有 Apple 开发者签名，Gatekeeper 会拦截 —— **右键（或 Ctrl+点击）→ 打开 → 再点「打开」** 即可，之后正常双击。

## 通过 GitHub Releases 分发

1. 把本目录整体推到 GitHub（它就是一个独立仓库）。
2. 打 tag 触发构建：

```sh
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` 会在 macOS runner 上构建 arm64 + x64 两个 DMG 并挂到 Release 页面。别人下载安装即可，机器上无需 Node。

> 想做到「双击直接打开」（无右键步骤）需要 Apple Developer ID（$99/年）+ 公证：在 `package.json` 的 `build.mac` 里配置 `identity` 与 `notarize` 即可，当前未启用。

## 升级 Harness 版本

改 `package.json` 里 `@deepseek-ai/dsh` 的版本 → `npm install` → 重新 `npm run dist`。

## 常见问题

- **端口冲突？** 不存在：应用用 `--port 0` 让系统挑空闲端口。
- **和终端里的 `dsh web` 同时开？** 可以，是两个独立实例；会话数据都落在 `~/.dsh`，建议不要同时对同一会话操作。
- **窗口没有菜单栏？** 默认隐藏，按 `Alt` 临时呼出（复制 / 粘贴等快捷键始终可用）。

## 许可证

MIT，见 [LICENSE](LICENSE)。
