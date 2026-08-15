# 开发与发布（面向维护者）

本文档面向维护者，说明构建、打包与发布流程；使用说明见 [README.md](README.md)。

## 开发运行

```sh
npm install   # 首次
npm run icon  # 把 assets/icon.png 转成 build/icon.icns（换图标后重跑）
npm start     # 开发模式直接跑
```

## 打包

```sh
npm run pack       # 只产出 .app（最快）：dist/mac*/DeepSeek Harness.app
npm run dist       # 产出当前架构的 .dmg
npm run dist:all   # 产出 arm64 + x64 两个 DMG（用于发布）
```

## 发布到 GitHub Releases

推送 tag 即触发 `.github/workflows/release.yml` 在 macOS runner 上构建 arm64 + x64 两个 DMG 并挂到 Release 页面：

```sh
git tag v<版本号>
git push origin v<版本号>
```

## 升级 dsh 版本

dsh 官方发布新版本后，桌面应用的依赖升级流程：

1. `npm view @deepseek-ai/dsh version` 查看最新版本；
2. `package.json` 中 `@deepseek-ai/dsh` 与其余 19 个显式声明的 `@deepseek-ai/*` 包同步改为新版本（它们随 dsh 一起发版）；
3. `npm install`；
4. `node scripts/check-deps.mjs` —— 校验版本同步与打包闭包完整性（无打包产物时只检查版本同步）；
5. 打包并在隔离目录启动回归：内测声明弹窗、界面汉化（`--remote-debugging-port` 配合 `scripts/verify-popup.mjs`、`scripts/verify-i18n.mjs`、`scripts/verify-session-log.mjs` 辅助检查）；
6. 打 tag 发版，用户经应用更新通道获得新 dsh。

## 检查更新功能

一期为「GitHub 检查 + 半自动安装」：设置 → 通用 末尾的「检查更新」按钮（preload 注入），主进程 `updater.mjs` 查询 GitHub 最新 Release、下载当前架构 DMG 到「下载」文件夹并自动打开安装包；应用启动时静默检查一次，有新版本时界面顶部显示提示条。文案双语（zh/en）由界面语言探针决定，原生弹窗文案由渲染层传入主进程。

- IPC 通道：`dsh-update:check` / `startup-status` / `download`（进度经 `dsh-update:progress` 事件）/ `dialog` / `open-path` / `open-external`；
- 测试钩子（环境变量）：`DSH_DESKTOP_CURRENT_VERSION` 伪造当前版本以触发「有新版本」路径；`DSH_DESKTOP_UPDATE_ASSET_URL` / `DSH_DESKTOP_UPDATE_ASSET_NAME` 把下载源指到本地小块文件，避免真实下载 151MB DMG；
- 将来接 Gitee 镜像或对象存储做国内加速：在 `checkForUpdate` / `downloadDmg` 里加回退链即可，界面层无需改动；全自动更新（替换运行中应用）需要 Apple Developer ID 签名 + 公证。

## 打包依赖说明

`package.json` 里除 `@deepseek-ai/dsh` 外还显式声明了 19 个 `@deepseek-ai/*` 包：它们是 harness 的传递 peer 依赖。electron-builder 收集依赖树时会丢弃未直接声明的 peer 包，导致应用在无父级 node_modules 的环境（如 /Applications）启动即崩溃（`ERR_MODULE_NOT_FOUND`）。显式声明才能保证打包完整；升级 `@deepseek-ai/dsh` 时保持这些版本与之同步。

### 界面文案定制

首次引导弹窗（内测声明）的文案由 `preload.cjs` 替换为产品定制内容（中英双语，GitHub Issue 链接指向本仓库）。修改文案只需编辑 `preload.cjs` 后重新打包；识别条件是官方原文标题且弹窗内无输入框。

### 本机沙箱环境构建提示

在受限沙箱中构建时，electron-builder 无法写入默认缓存目录，可用 CLI 覆盖指向本地 Electron 发行版（生产构建无需）：

```sh
npx electron-builder --dir -c.electronDist=node_modules/electron/dist
```

## 签名与公证

当前使用 ad-hoc 签名（`build.mac.identity = "-"`）+ hardened runtime entitlements（`entitlements.mac.plist`）。用户首次打开需右键 → 打开。若要「双击直接打开」且免警告，需要 Apple Developer ID（$99/年）+ 公证：在 `package.json` 的 `build.mac` 里配置 `identity` 与 `notarize` 即可。

## 应用内自动更新（未实现）

如需应用内检查更新（electron-updater），需要：`build.mac.target` 加回 `zip`（增量更新依赖 zip + blockmap），并配置 Developer ID 签名与公证（Gatekeeper 校验下载的更新包）。
