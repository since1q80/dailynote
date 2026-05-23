# DailyNote

DailyNote 是一个本地优先的 AI 笔记应用。你只负责把想法写下来，它负责把散乱的 daily notes 自动整理成可以回看的知识网络。

它不是另一个需要你维护标签、文件夹和双链的笔记系统。DailyNote 更像一个安静的研究助理：读你的笔记，提炼主题，连接旧想法，并在你回到首页时给你一段真正有用的回顾。

## 为什么值得试

- **写完就走**：快速记录窗口适合随手捕捉想法，不需要先决定分类。
- **自动整理**：AI 会为 note 提取主题、标签、人物和相关旧笔记。
- **Daily Brief 首页**：首页不是冷冰冰的数据表，而是一段主动回顾，帮你看见最近在想什么。
- **本地 Markdown**：笔记以 Markdown 文件保存，默认不进入 Git，可以用 Obsidian、VSCode 或任何编辑器打开。
- **你的数据属于你**：数据目录可自选，适合放在 iCloud、Dropbox 或其他同步目录中。
- **可换 AI Provider**：支持 OpenAI、Anthropic 和 OpenAI-compatible provider，适合接入本地或第三方模型服务。

## 适合谁

DailyNote 适合这些人：

- 每天都有零散想法，但不想维护复杂知识库。
- 写了很多 note，却很少回看，也很难发现长期模式。
- 想要 AI 帮忙整理，但不想把笔记锁进封闭平台。
- 喜欢 Markdown、本地文件和可迁移数据。

如果你想要的是成熟团队协作、富文本排版、多人权限、移动端同步，DailyNote 目前还不是那个产品。它现在更适合个人知识整理和早期尝鲜。

## 当前状态

DailyNote 目前是一个早期 macOS 桌面应用，基于 Next.js + Electron 构建。核心体验已经可用：

- 快速记录
- 首页 Daily Brief
- 自动分类和标签
- 概念卡片
- 人物视图
- 笔记问答
- 本地数据目录
- AI Provider 设置
- macOS 菜单栏入口和全局快捷键

## 安装使用

如果 GitHub Releases 中已经提供 macOS app，可以直接下载使用。首次打开后，在设置页里填写你的 AI Provider 和 API key。

如果暂时还没有 release，可以先从源码运行：

```bash
npm install
npm run desktop:dev
```

如果 app 未签名，macOS 可能会提示无法打开。可以在系统设置的安全性页面允许打开，或自行从源码构建。

## 本地开发

前提：安装 Node.js 18+ 和 npm。

```bash
npm install
cp .env.example .env.local
npm run desktop:dev
```

也可以不配置 `.env.local`，直接在 app 的设置页里填写 Provider 和 API key。

`npm run dev` 只启动 Next.js Web 服务，主要用于单独调试页面；日常开发桌面 app 请使用：

```bash
npm run desktop:dev
```

## 打包 macOS App

```bash
# 生成可分发的 macOS 构建
npm run desktop:build

# 只生成未签名的本地 app 目录，适合快速检查
npm run desktop:pack
```

构建产物会输出到 `dist/`。公开分发前建议完成签名和 notarization；未签名 app 分享给别人时，macOS 可能会拦截打开。

## 数据与隐私

DailyNote 默认使用本地文件系统保存数据。你的笔记不会被提交到仓库，`data/` 已经在 `.gitignore` 中排除。

默认数据结构类似这样：

```text
DATA_DIR/
  notes/          原始笔记
  concepts/       自动整理出的概念卡
  people/         人物相关索引
  analysis/       AI 分析结果
  note-links/     笔记之间的关系
  purpose.md      你的使用目标
```

你可以在 app 设置页选择自己的数据目录。开发 Web 版本时，也可以在 `.env.local` 中指定：

```bash
DATA_DIR=/Users/you/Library/Mobile Documents/com~apple~CloudDocs/dailynote-data
```

注意：如果你使用云端 AI Provider，笔记内容会发送给对应 Provider 进行分析。是否使用 OpenAI、Anthropic、本地模型或其他兼容接口，由你在设置中决定。

## 产品理念

**不要让用户维护知识库。**
很多笔记软件把整理工作包装成高级功能，最后还是让用户手动维护标签、链接和文件夹。DailyNote 的方向相反：用户只写，系统整理。

**文件应该比应用活得更久。**
笔记以 Markdown 保存，方便迁移、备份和二次加工。即使不用 DailyNote，数据仍然可读。

**AI 输出必须能回到原文。**
问答和总结应该基于你的笔记，而不是凭空生成漂亮但不可验证的结论。

## 项目结构

```text
dailynote/
├── app/                  Next.js 页面 + API
│   ├── page.tsx            首页
│   ├── capture/            写新笔记
│   ├── quick-capture/      快速记录窗口
│   ├── settings/           Mac app / AI 设置
│   ├── concepts/[title]/   概念详情 + 问答
│   └── api/                后端路由
├── electron/             Mac 桌面壳、菜单栏、快捷键
├── lib/
│   ├── prompts.ts          核心 prompt
│   ├── llm.ts              AI Provider 封装
│   ├── storage.ts          Markdown 文件读写
│   ├── compile.ts          笔记分析与编排
│   └── types.ts
└── data/                 你的笔记，Git 默认不跟踪
```

## 路线图

- 更完整的周报和月度回顾
- 更主动的 Echo：写新 note 时浮现相关旧想法
- 拆分、合并概念的 UI
- 更完整的全文搜索
- 更好的导出能力
- 更稳定的签名和发布流程

## License

DailyNote is released under the MIT License. See [LICENSE](./LICENSE) for details.
