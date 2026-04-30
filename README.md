# DailyNote

个人笔记 + 自动知识库。写 note 是你的事，整理是它的事。

- 笔记以 **markdown** 存在 `./data/notes/`，概念卡在 `./data/concepts/`
- 可以直接用 **Obsidian / VSCode** 打开 `data/` 目录，你的数据永远是你的
- LLM 在后台做三件事：**分类 → 编译 → 问答**，全部基于你自己写的内容

## 快速开始

前提：装了 **Node.js 18+** 和 **npm**。

```bash
# 1. 安装依赖
npm install

# 2. 配置 OpenAI API key
cp .env.example .env.local
# 然后用编辑器打开 .env.local，填上你的 key
# https://platform.openai.com/api-keys

# 3. 跑起来
npm run dev
```

打开 <http://localhost:3000>。

## 第一次使用建议

直接开写，越自然越好。**别想着"该分在哪个主题"**——分类是系统的活，你的活是把脑子里的东西倒出来。

写到 **3-5 条相关** 的笔记后，对应的主题合成（紫色那段）才会真正有内容。单条笔记的主题卡是空的很正常。

## 几个我想清楚的设计选择

**为什么用文件系统，不用数据库？**  
因为你的笔记应该永远是 markdown，跑在别的工具里也能读。SQLite 索引更快但把数据锁进 app。这个 MVP 就 5000 条以下，硬盘 I/O 完全够用。

**为什么一条 note 可以属于多个主题？**  
"今天开会说'复杂'其实是我没想清楚" 既是 _工作焦虑_ 也是 _沟通习惯_。强行单选会丢信息。

**为什么主题卡允许"重新分析"而不允许"编辑"？**  
编辑按钮 = 你手工维护 = 产品倒退成 Obsidian。这个产品卖的就是"你不用维护"。你能做的只是：加新笔记让它重新编译、拆分主题让它知道归错了。

**为什么答案里强制引用？**  
不然 LLM 会编。带 `[编号]` 的答案可以被验证，这是信任的来源。

## 成本参考

用 `gpt-5.4-nano` 分类（~$0.20/M 输入）+ `gpt-5.4-mini` 编译问答（~$0.75/M 输入）。个人使用估算：

- 一条 note 保存触发：~1 分钱以下
- 一次问答：~2-5 分钱
- 月度总成本：如果你一天写 5 条、问 2 次，大概 **$1-3/月**

## 数据目录说明

默认 `./data/`。想放到其他位置（比如 iCloud/Dropbox 同步文件夹），改 `.env.local`：

```
DATA_DIR=/Users/you/Library/Mobile Documents/com~apple~CloudDocs/dailynote-data
```

## 目录结构

```
dailynote/
├── app/                  Next.js 页面 + API
│   ├── page.tsx            首页
│   ├── capture/            写新笔记
│   ├── concepts/[title]/   概念详情 + 问答
│   └── api/                后端路由
├── lib/
│   ├── prompts.ts          三个核心 prompt ⭐ 产品灵魂
│   ├── openai.ts           OpenAI API 封装
│   ├── storage.ts          markdown 文件读写
│   ├── compile.ts          编排层
│   └── types.ts
└── data/                 你的笔记（git 默认不跟踪）
    ├── notes/
    └── concepts/
```

## 还没做的（欢迎自己加）

- 周报（每周日自动生成本周回顾）
- Echo（写新笔记时弹出相关的老笔记）
- 跨主题问答（"我最近在想什么"）
- 拆分/合并主题的 UI（现在要手动改 md 文件的 frontmatter）
- 导出、全文搜索
