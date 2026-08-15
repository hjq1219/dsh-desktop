# DeepSeek Harness Desktop

DeepSeek Harness 的 macOS 桌面版：把 Harness 的界面封装成独立应用，双击即用。无需安装 Node，无需打开终端，无需浏览器。

## 安装

1. 在 [Releases](https://github.com/hjq1219/dsh-desktop/releases) 页面下载最新版 DMG：
   - Apple Silicon（M1/M2/M3/M4）→ `DeepSeek.Harness-<版本号>-arm64.dmg`
   - Intel Mac → `DeepSeek.Harness-<版本号>.dmg`
2. 打开 DMG，把 DeepSeek Harness 拖入「应用程序」。
3. 首次打开：右键（或 Ctrl+点击）应用图标 → 打开 → 再点「打开」；之后正常双击即可。

## 配置 API 密钥

在 `~/.zshrc` 中加入一行：

```sh
export DEEPSEEK_HARNESS='sk-你的密钥'
```

应用启动时会自动读取该配置作为 API 密钥，打开即可使用，无需再手动输入。

> 修改 `~/.zshrc` 后，需要完全退出应用（Cmd+Q）再重新打开，应用在启动时读取该文件。

## 基本使用

- 双击图标打开独立窗口。
- 关闭窗口（点左上角红色按钮）后应用仍留在 Dock，点 Dock 图标即可再次打开。
- 完全退出：Cmd+Q（同时停掉后台服务）。
- 重复双击图标不会打开第二个实例，只会聚焦已有窗口。
- 界面默认语言为中文，可在「设置 → 通用」中切换。
- 会话记录保存在 `~/.dsh`，与命令行版 `dsh web` 共享；两个入口不要同时对同一会话操作。

## 升级

打开「设置 → 通用 → 检查更新」检查新版本，按提示下载并安装即可；发布新版本后，应用启动时也会提示。升级不影响会话记录。

## 常见问题

**打开时提示「无法验证开发者」？**
右键（或 Ctrl+点击）→ 打开 → 再点「打开」；或在「系统设置 → 隐私与安全性」中点击「仍要打开」。

**窗口没有菜单栏？**
默认隐藏，按 `Alt` 临时呼出；复制、粘贴等快捷键始终可用。
