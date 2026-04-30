export type Lang = 'zh' | 'en';

const dict: Record<string, Record<Lang, string>> = {
  // Layout
  'nav.settings': { zh: '设置', en: 'Settings' },

  // Common
  'common.back': { zh: '← 返回', en: '← Back' },
  'common.home': { zh: '← 首页', en: '← Home' },
  'common.loading': { zh: '加载中…', en: 'Loading…' },
  'common.error': { zh: '出错了：{msg}', en: 'Error: {msg}' },
  'common.save': { zh: '保存', en: 'Save' },
  'common.saving': { zh: '保存中…', en: 'Saving…' },
  'common.saved': { zh: '已保存', en: 'Saved' },
  'common.ask': { zh: '问', en: 'Ask' },
  'common.yourQuestion': { zh: '你问的', en: 'Your question' },
  'common.haventWritten': { zh: '你没写过的', en: "What you haven't written" },
  'common.followUp': { zh: '要不要接着问', en: 'Follow up' },

  // Greeting
  'greeting.lateNight': { zh: '夜深了', en: 'Late night' },
  'greeting.morning': { zh: '早上好', en: 'Good morning' },
  'greeting.noon': { zh: '中午好', en: 'Good afternoon' },
  'greeting.afternoon': { zh: '下午好', en: 'Good afternoon' },
  'greeting.evening': { zh: '晚上好', en: 'Good evening' },

  // Home page
  'home.stats': { zh: '{notes} 条笔记 · {concepts} 个主题', en: '{notes} notes · {concepts} topics' },
  'home.prompt': { zh: '你在想什么？', en: "What's on your mind?" },
  'home.people': { zh: '人物', en: 'People' },
  'sidebar.collapse': { zh: '收起', en: 'Collapse' },
  'sidebar.expand': { zh: '展开', en: 'Expand' },
  'home.noPeople': { zh: '还没提到过任何人', en: 'No people mentioned yet' },
  'home.tags': { zh: '标签', en: 'Tags' },
  'home.noTags': { zh: '还没有标签', en: 'No tags yet' },

  // Tag page
  'tag.notes': { zh: '{n} 条笔记', en: '{n} notes' },
  'home.topics': { zh: '主题', en: 'Topics' },
  'home.recent': { zh: '最近', en: 'Recent' },
  'home.noteCount': { zh: '{n} 条', en: '{n}' },
  'home.empty': { zh: '还是空的。\n点上面输入框，写下第一条。', en: "Nothing yet.\nClick the input above to write your first note." },

  // NoteCard
  'note.expand': { zh: '展开', en: 'Expand' },
  'note.collapse': { zh: '收起', en: 'Collapse' },
  'note.edit.save': { zh: '保存', en: 'Save' },
  'note.edit.saving': { zh: '保存中…', en: 'Saving…' },
  'note.edit.cancel': { zh: '取消', en: 'Cancel' },
  'note.addTag': { zh: '+ 标签', en: '+ Tag' },
  'note.tagPlaceholder': { zh: '标签名', en: 'tag name' },
  'note.removeTag': { zh: '删除标签 {tag}', en: 'Remove tag {tag}' },

  // SearchBox
  'search.placeholder': { zh: '昨天说过什么？/ 搜索某个话题...', en: 'What did you say yesterday? / Search a topic...' },
  'search.clear': { zh: '清除结果', en: 'Clear results' },
  'search.searching': { zh: '搜索中', en: 'Searching' },
  'search.go': { zh: '搜', en: 'Go' },
  'search.relatedNotes': { zh: '相关笔记', en: 'Related notes' },
  'search.followUp': { zh: '接着问', en: 'Follow up' },

  // Capture page
  'capture.cancel': { zh: '← 取消', en: '← Cancel' },
  'capture.justNow': { zh: '刚刚', en: 'Just now' },
  'capture.saving': { zh: '保存中...', en: 'Saving...' },
  'capture.save': { zh: '保存', en: 'Save' },
  'capture.placeholder': { zh: '随便写点什么...\n支持 markdown。Cmd/Ctrl + Enter 保存。', en: 'Write anything...\nMarkdown supported. Cmd/Ctrl + Enter to save.' },
  'capture.saveFailed': { zh: '保存失败：{msg}', en: 'Save failed: {msg}' },
  'capture.charCount': { zh: '{n} 字', en: '{n} chars' },
  'capture.polish': { zh: '润色', en: 'Polish' },
  'capture.polishing': { zh: '润色中…', en: 'Polishing…' },
  'capture.polishFailed': { zh: '润色失败：{msg}', en: 'Polish failed: {msg}' },

  // Concept detail
  'concept.notes': { zh: '{n} 条笔记', en: '{n} notes' },
  'concept.synthesis': { zh: '你关于这个主题的思考', en: 'Your thinking on this topic' },
  'concept.noSynthesis': { zh: '合成还没生成。', en: 'Summary not yet generated.' },
  'concept.noSynthesisFew': { zh: '再写几条相关笔记会自动生成。', en: "Write a few more related notes and it'll auto-generate." },
  'concept.noSynthesisTrigger': { zh: '点右上角"重新分析"手动触发。', en: 'Click "Reanalyze" in the top right to trigger manually.' },
  'concept.evolution': { zh: '演变', en: 'Evolution' },
  'concept.contradictions': { zh: '矛盾 / 张力', en: 'Contradictions / Tensions' },
  'concept.patterns': { zh: '观察到的模式', en: 'Observed patterns' },
  'concept.related': { zh: '相关', en: 'Related' },
  'concept.yourWords': { zh: '你的原话', en: 'Your exact words' },
  'concept.askLink': { zh: '问关于「{title}」的问题 →', en: 'Ask about "{title}" →' },

  // Recompile button
  'recompile.analyzing': { zh: '分析中...', en: 'Analyzing...' },
  'recompile.button': { zh: '重新分析', en: 'Reanalyze' },

  // Ask page
  'ask.about': { zh: '问关于 · ', en: 'Ask about · ' },
  'ask.intro': { zh: '问任何关于「{title}」的问题。\n答案会基于你自己写过的笔记，每句话都会附上引用。', en: 'Ask anything about "{title}".\nAnswers are based on your own notes, with citations for every claim.' },
  'ask.examples': { zh: '例如', en: 'For example' },
  'ask.example1': { zh: '我通常什么时候会陷进去？', en: 'When do I usually get stuck on this?' },
  'ask.example2': { zh: '我自己有没有提过解决办法？', en: 'Have I mentioned any solutions myself?' },
  'ask.example3': { zh: '最近这件事有什么变化？', en: 'What has changed about this recently?' },
  'ask.loading': { zh: '在翻你的笔记...', en: 'Looking through your notes...' },
  'ask.placeholder': { zh: '继续问... (Cmd/Ctrl + Enter 发送)', en: 'Continue asking... (Cmd/Ctrl + Enter to send)' },

  // Person page
  'person.mentions': { zh: '{n} 条提及', en: '{n} mentions' },
  'person.notes': { zh: '提到过的笔记', en: 'Notes mentioning this person' },
  'person.askPlaceholder': { zh: '问关于「{name}」的问题... (Cmd/Ctrl + Enter 发送)', en: 'Ask about "{name}"... (Cmd/Ctrl + Enter to send)' },

  // Settings
  'settings.title': { zh: '设置', en: 'Settings' },
  'settings.modified': { zh: '已修改', en: 'Modified' },
  'settings.resetToDefault': { zh: '重置为默认', en: 'Reset to default' },
  'settings.charCount': { zh: '{n} 字符', en: '{n} characters' },
  'settings.language': { zh: '语言', en: 'Language' },
  'settings.prompts': { zh: 'Prompts', en: 'Prompts' },

  // Prompt labels (shown in settings sidebar)
  'prompt.CLASSIFY_SYSTEM': { zh: '分类', en: 'Classify' },
  'prompt.COMPILE_SYSTEM': { zh: '归纳', en: 'Compile' },
  'prompt.ASK_SYSTEM': { zh: '问答', en: 'Q&A' },
  'prompt.EXTRACT_TAGS_SYSTEM': { zh: '标签提取', en: 'Tag Extraction' },
  'prompt.EXTRACT_PEOPLE_SYSTEM': { zh: '人物提取', en: 'People Extraction' },
  'prompt.GLOBAL_ASK_SYSTEM': { zh: '全局搜索', en: 'Global Search' },
};

export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const val = dict[key]?.[lang] ?? dict[key]?.zh ?? key;
  if (!params) return val;
  return val.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

export function createT(lang: Lang) {
  return (key: string, params?: Record<string, string | number>) => t(lang, key, params);
}
