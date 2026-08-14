// preload.cjs — 把首次引导弹窗（内测声明）的内容替换为产品定制文案。
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

  function sweep() {
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog === null) return
    if (dialog.querySelector('input, textarea') !== null) return
    const heading = dialog.querySelector('h2')
    const copy = CONTENT[heading?.textContent?.trim() ?? '']
    if (copy === undefined) return
    if (isCustomized(dialog)) return
    applyCopy(dialog, copy)
  }

  const observer = new MutationObserver(sweep)
  // document 在 preload 执行阶段即存在；documentElement 此时可能尚未出现。
  observer.observe(document, { childList: true, subtree: true })
  sweep()
})()
