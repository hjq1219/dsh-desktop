// preload.cjs — 桌面外壳的两处界面定制：
// 1. 把首次引导弹窗（内测声明）的内容替换为产品定制文案；
// 2. 界面汉化：harness 里三处不走词典的英文标签（Session log 下载按钮、
//    安全级别、推理等级）在中文界面下显示为中文。
//
// 纯 DOM 脚本：不引用任何 Node / Electron API，兼容 sandbox 隔离环境。
// 识别方式：弹窗内的 h2 标题必须是官方原文（zh/en），且弹窗内没有输入框
// （绝不处理「添加 API Key」一类带表单的引导）。替换正文段落，第二段的
// "Issue" 渲染为可点击超链接（target=_blank 由主进程外链处理转交系统浏览器）。
// 替换是幂等的：若 React 重渲染把文案复原，观察器会再次替换。
// 弹窗自身的「确认一次后不再出现」机制保持不变。

(() => {
  const ISSUE_URL = 'https://github.com/hjq1219/dsh-desktop/issues'

  const CONTENT = {
    '内测声明': {
      paragraphs: [
        '欢迎使用 DeepSeek Harness 桌面版！本应用目前仍处于内测阶段，部分功能可能还不够完善，我们会持续改进和打磨。',
      ],
      linkBefore: '如果您在使用中遇到问题或有任何建议，欢迎到 GitHub 提交 ',
      linkText: 'Issue',
      linkAfter: '，或发送邮件至 1752893735@qq.com，我们会尽快处理。',
    },
    'Internal Testing Notice': {
      paragraphs: [
        'Welcome to DeepSeek Harness Desktop! The app is still in internal testing, and some features may not be complete yet. We will keep improving and polishing it.',
      ],
      linkBefore: 'If you run into issues or have suggestions, feel free to open an ',
      linkText: 'Issue',
      linkAfter: ' on GitHub, or email us at 1752893735@qq.com. We will respond as soon as we can.',
    },
  }

  function buildLinkParagraph(before, linkText, after) {
    const link = document.createElement('a')
    link.href = ISSUE_URL
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = linkText
    return [before, link, after]
  }

  /** 就地改写段落内容：纯文本或「前文 + 链接 + 后文」，不动段落外的任何节点。 */
  function fillParagraph(p, content) {
    if (typeof content === 'string') {
      p.textContent = content
      return
    }
    p.replaceChildren(...content)
  }

  /** 按我们的文案就地改写弹窗内已有的 <p>，缺失的补齐、多余的移除。 */
  function applyCopy(dialog, copy) {
    const paragraphs = [...dialog.querySelectorAll('p')]
    const parent = paragraphs[0]?.parentElement
    if (parent === null || parent === undefined) return
    const desired = [...copy.paragraphs, buildLinkParagraph(copy.linkBefore, copy.linkText, copy.linkAfter)]
    for (let i = 0; i < Math.max(paragraphs.length, desired.length); i++) {
      if (i < paragraphs.length && i < desired.length) {
        fillParagraph(paragraphs[i], desired[i])
      } else if (i < desired.length) {
        const p = document.createElement('p')
        fillParagraph(p, desired[i])
        parent.appendChild(p)
      } else {
        paragraphs[i].remove()
      }
    }
    replacedCount += 1
    console.log(`[dsh-desktop] 内测声明文案已替换（第 ${replacedCount} 次）`)
  }

  /** 判断弹窗是否已经是我们的文案（用首段前缀，避免依赖 DOM 标记被重置）。 */
  function isCustomized(dialog) {
    const first = dialog.querySelector('p')?.textContent ?? ''
    for (const copy of Object.values(CONTENT)) {
      if (first.startsWith(copy.paragraphs[0].slice(0, 10))) return true
    }
    return false
  }

  let replacedCount = 0

  function sweepNotice() {
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog === null) return
    if (dialog.querySelector('input, textarea') !== null) return
    const heading = dialog.querySelector('h2')
    const copy = CONTENT[heading?.textContent?.trim() ?? '']
    if (copy === undefined) return
    if (isCustomized(dialog)) return
    applyCopy(dialog, copy)
  }

  const noticeObserver = new MutationObserver(sweepNotice)
  // document 在 preload 执行阶段即存在；documentElement 此时可能尚未出现。
  noticeObserver.observe(document, { childList: true, subtree: true })
  sweepNotice()
})();

// —— 界面汉化器 ——
// harness 里这三处标签不走词典（写死 / 数据派生），在中文界面下由桌面外壳
// 做显示层替换。语言探针用词典渲染的「新建会话 / New session」按钮，实时
// 跟随语言切换；替换范围限定在按钮、菜单项、选项与弹窗内，不触碰聊天内容。
// 切回英文时反向恢复（这些标签 React 不会因语言切换而重置）。
(() => {
  const LABELS = new Map([
    ['Session log', '会话日志'],
    ['Read Only', '只读'],
    ['Workspace Write', '工作区可写'],
    ['Full access', '完全访问'],
    ['Off', '关闭'],
    ['High', '高'],
    ['Max', '最高'],
  ])
  const REVERSE = new Map([...LABELS].map(([en, zh]) => [zh, en]))
  const ZH_MARKER = '新建会话'
  const EN_MARKER = 'New session'

  let localeCache = null
  let initialPassDone = false

  const SCOPE_SELECTOR = 'button, [role="menuitem"], [role="menuitemradio"], [role="option"], [role="dialog"]'

  function detectLocale() {
    for (const button of document.querySelectorAll('button')) {
      const text = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim()
      if (text === ZH_MARKER) return 'zh'
      if (text === EN_MARKER) return 'en'
    }
    return localeCache
  }

  /** 弹窗范围内的长句里嵌着 "Full access"，中文界面下做子串替换。 */
  function translateDialogText(text, locale) {
    if (locale === 'zh' && text.includes('Full access')) {
      return text.replaceAll('Full access', '完全访问')
    }
    return text
  }

  function translateNode(node, locale) {
    const parent = node.parentElement
    if (parent === null) return
    const inDialog = parent.closest('[role="dialog"]') !== null
    if (!inDialog && parent.closest(SCOPE_SELECTOR) === null) return
    const text = node.textContent?.trim() ?? ''
    if (text === '') return
    if (locale === 'zh') {
      const zh = LABELS.get(text)
      if (zh !== undefined) node.textContent = zh
      else if (inDialog) {
        const replaced = translateDialogText(text, 'zh')
        if (replaced !== text) node.textContent = replaced
      }
    } else {
      const en = REVERSE.get(text)
      if (en !== undefined) node.textContent = en
    }
  }

  function collectNodes(record, target) {
    if (record.type === 'characterData') {
      target.add(record.target)
      return
    }
    for (const node of record.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        target.add(node)
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) target.add(walker.currentNode)
      }
    }
  }

  /** 快速过滤：与按钮/菜单/选项/弹窗无关的变更（如聊天流式文本）直接跳过。 */
  function recordRelevant(record) {
    if (record.type === 'characterData') {
      const parent = record.target.parentElement
      return parent !== null
        && (parent.closest('[role="dialog"]') !== null || parent.closest(SCOPE_SELECTOR) !== null)
    }
    for (const node of record.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement
        if (parent !== null
          && (parent.closest('[role="dialog"]') !== null || parent.closest(SCOPE_SELECTOR) !== null)) return true
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches(SCOPE_SELECTOR) || node.matches('[role="dialog"]')) return true
        if (node.querySelector(SCOPE_SELECTOR) !== null || node.querySelector('[role="dialog"]') !== null) return true
      }
    }
    return false
  }

  function fullPass(locale) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) translateNode(walker.currentNode, locale)
  }

  // 同步处理：MutationObserver 回调在 React 提交之后、浏览器绘制之前执行，
  // 菜单打开的同一帧内完成替换，用户看不到「英文 → 中文」的变化过程。
  const localizerObserver = new MutationObserver((records) => {
    const relevant = records.filter(recordRelevant)
    if (relevant.length === 0) return
    const locale = detectLocale()
    localeCache = locale
    if (locale === null) return
    const nodes = new Set()
    for (const record of relevant) collectNodes(record, nodes)
    for (const node of nodes) translateNode(node, locale)
    if (!initialPassDone) {
      initialPassDone = true
      fullPass(locale)
    }
  })
  localizerObserver.observe(document, { childList: true, subtree: true, characterData: true })
})()

// —— 检查更新（设置 → 通用 末尾注入「检查更新」行 + 启动新版本横幅）——
// 通过沙箱 preload 的 ipcRenderer 与主进程 updater.mjs 通信。
// 按钮行克隆现有「语言」行保持样式一致：克隆节点无 React fiber，
// 原有交互自动失效，只响应我们挂的 click。文案随界面语言（zh/en）。
;(() => {
  const { ipcRenderer } = require('electron')
  const RELEASES_URL = 'https://github.com/hjq1219/dsh-desktop/releases'

  const COPY = {
    zh: {
      rowLabel: '检查更新',
      checking: '正在检查…',
      latestTitle: '已是最新版本',
      latestMessage: v => `当前版本 v${v} 已是最新`,
      updateTitle: v => `发现新版本 v${v}`,
      updateMessage: (cur, next) => `当前版本 v${cur} → v${next}`,
      updateNow: '立即更新',
      later: '稍后',
      downloading: p => `下载中 ${p}%`,
      checkFailTitle: '检查更新失败',
      checkFailMessage: '无法访问更新服务器，请检查网络后重试。',
      openRelease: '打开 Release 页面',
      cancel: '取消',
      downloadFailTitle: '下载失败',
      downloadFailMessage: '下载更新包失败，请稍后重试。',
      doneTitle: '下载完成',
      doneMessage: '新版安装包已保存到「下载」文件夹。请打开安装包，把 DeepSeek Harness 拖入「应用程序」覆盖旧版，然后重新打开应用。',
      openInstaller: '打开安装包',
      close: '关闭',
      banner: v => `发现新版本 v${v} · 前往 设置 → 通用 → 检查更新`,
    },
    en: {
      rowLabel: 'Check for Updates',
      checking: 'Checking…',
      latestTitle: "You're up to date",
      latestMessage: v => `Version v${v} is the latest release`,
      updateTitle: v => `Update available: v${v}`,
      updateMessage: (cur, next) => `Current version v${cur} → v${next}`,
      updateNow: 'Update Now',
      later: 'Later',
      downloading: p => `Downloading ${p}%`,
      checkFailTitle: 'Update check failed',
      checkFailMessage: 'Could not reach the update server. Check your network and try again.',
      openRelease: 'Open Release Page',
      cancel: 'Cancel',
      downloadFailTitle: 'Download failed',
      downloadFailMessage: 'Failed to download the update. Please try again later.',
      doneTitle: 'Download complete',
      doneMessage: 'The installer has been saved to your Downloads folder. Open it, drag DeepSeek Harness into Applications to replace the old version, then relaunch the app.',
      openInstaller: 'Open Installer',
      close: 'Close',
      banner: v => `New version v${v} available · Settings → General → Check for Updates`,
    },
  }

  function detectLocale() {
    for (const button of document.querySelectorAll('button')) {
      const text = (button.getAttribute('aria-label') ?? button.textContent ?? '').trim()
      if (text === '新建会话') return 'zh'
      if (text === 'New session') return 'en'
    }
    return null
  }

  async function showDialog(copy, options) {
    return ipcRenderer.invoke('dsh-update:dialog', {
      title: options.title,
      message: options.message,
      detail: options.detail ?? '',
      buttons: options.buttons,
      defaultId: options.defaultId ?? 0,
      cancelId: options.cancelId ?? options.buttons.length - 1,
    })
  }

  async function onCheckUpdate(control, locale) {
    const copy = COPY[locale]
    control.textContent = copy.checking
    const result = await ipcRenderer.invoke('dsh-update:check')
    if (!result.ok) {
      const choice = await showDialog(copy, {
        title: copy.checkFailTitle,
        message: copy.checkFailMessage,
        detail: result.error,
        buttons: [copy.openRelease, copy.cancel],
      })
      if (choice === 0) await ipcRenderer.invoke('dsh-update:open-external', RELEASES_URL)
      control.textContent = copy.rowLabel
      return
    }
    if (!result.hasUpdate) {
      await showDialog(copy, {
        title: copy.latestTitle,
        message: copy.latestMessage(result.current),
        buttons: [copy.close],
      })
      control.textContent = copy.rowLabel
      return
    }
    const detail = copy.updateMessage(result.current, result.latest)
      + (result.notes === '' ? '' : `\n\n${result.notes}`)
    const choice = await showDialog(copy, {
      title: copy.updateTitle(result.latest),
      message: detail,
      buttons: [copy.updateNow, copy.later],
    })
    if (choice !== 0 || result.asset === null) {
      control.textContent = copy.rowLabel
      return
    }
    const onProgress = (_event, progress) => {
      const pct = progress.total > 0 ? Math.min(99, Math.round(progress.received / progress.total * 100)) : 0
      control.textContent = copy.downloading(pct)
    }
    ipcRenderer.on('dsh-update:progress', onProgress)
    const download = await ipcRenderer.invoke('dsh-update:download', result.asset)
    ipcRenderer.removeListener('dsh-update:progress', onProgress)
    if (!download.ok) {
      await showDialog(copy, {
        title: copy.downloadFailTitle,
        message: copy.downloadFailMessage,
        detail: download.error,
        buttons: [copy.close],
      })
      control.textContent = copy.rowLabel
      return
    }
    control.textContent = copy.rowLabel
    const doneChoice = await showDialog(copy, {
      title: copy.doneTitle,
      message: copy.doneMessage,
      buttons: [copy.openInstaller, copy.close],
    })
    if (doneChoice === 0) await ipcRenderer.invoke('dsh-update:open-path', download.path)
  }

  // 在设置 → 通用 区块末尾注入「检查更新」行。
  function injectUpdateRow() {
    const locale = detectLocale()
    if (locale === null) return
    const label = locale === 'zh' ? '语言' : 'Language'
    const title = [...document.querySelectorAll('div')].find(
      el => el.children.length === 0 && (el.textContent ?? '').trim() === label,
    )
    if (title === undefined) return
    const row = title.parentElement?.parentElement
    const list = row?.parentElement
    if (list === null || list === undefined) return
    if (list.dataset.dshUpdateInjected === '1') return
    // 克隆语言行的行结构（标题 + 控件槽），控件换成设置面板动作区的
    // 普通 outline 按钮模板（如「打开配置文件」），避免下拉选择器外观
    const template = document.querySelector('[class*="VOzbGW_actions"] button')
    if (template === null) return
    const clone = row.cloneNode(true)
    const cloneRowText = clone.children[0]
    const control = clone.children[1]
    if (cloneRowText === undefined || control === undefined) return
    cloneRowText.textContent = COPY[locale].rowLabel
    const button = template.cloneNode(true)
    button.textContent = COPY[locale].rowLabel
    button.addEventListener('click', () => { void onCheckUpdate(button, locale) })
    control.replaceChildren(button)
    list.appendChild(clone)
    list.dataset.dshUpdateInjected = '1'
  }

  // 设置面板出现（通用区块容器在 DOM 里）时尝试注入；关掉重开会重建 DOM 重新注入。
  const updateObserver = new MutationObserver(() => {
    if (document.querySelector('[class*="_WvWnq_section"]') !== null) injectUpdateRow()
  })
  updateObserver.observe(document, { childList: true, subtree: true })

  // 启动横幅：渲染层就绪后拉取主进程缓存的检查结果。
  let bannerTries = 0
  function tryBanner() {
    if (bannerTries >= 6) return
    bannerTries += 1
    console.log("[dsh-desktop] tryBanner attempt " + bannerTries + ", locale=" + detectLocale() + ", body=" + (document.body !== null))
    if (detectLocale() === null || document.body === null) {
      setTimeout(tryBanner, 2000)
      return
    }
    void (async () => {
      let result
      try {
        result = await ipcRenderer.invoke("dsh-update:startup-status")
        console.log("[dsh-desktop] startup-status result: " + JSON.stringify({ ok: result.ok, hasUpdate: result.hasUpdate, error: result.error ?? null }))
      } catch (error) {
        console.log("[dsh-desktop] banner invoke failed: " + String(error))
        return
      }
      if (!result.ok || !result.hasUpdate) return
      const locale = detectLocale() ?? 'zh'
      const banner = document.createElement('div')
      banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;background:#1e2a4a;color:#fff;padding:10px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);font-size:13px;display:flex;align-items:center;gap:8px;cursor:pointer'
      banner.textContent = COPY[locale].banner(result.latest)
      const closeBtn = document.createElement('span')
      closeBtn.textContent = '✕'
      closeBtn.style.cssText = 'margin-left:8px;opacity:.7'
      closeBtn.addEventListener('click', (event) => {
        event.stopPropagation()
        banner.remove()
      })
      banner.appendChild(closeBtn)
      banner.addEventListener('click', () => {
        void ipcRenderer.invoke('dsh-update:open-external', RELEASES_URL)
        banner.remove()
      })
      document.body.appendChild(banner)
    })()
  }
  setTimeout(tryBanner, 3000)
})()
