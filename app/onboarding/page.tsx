'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Config = Awaited<ReturnType<NonNullable<typeof window.dailyNote>['getConfig']>>;
type Provider = 'openai' | 'anthropic' | 'openai_compatible' | 'qwen' | 'zhipu' | 'minimax';

const PROVIDERS: Array<{ value: Provider; label: string; hint: string }> = [
  { value: 'openai', label: 'OpenAI', hint: 'GPT 系列模型' },
  { value: 'anthropic', label: 'Anthropic', hint: 'Claude 系列模型' },
  { value: 'qwen', label: '通义千问', hint: '阿里云 DashScope' },
  { value: 'zhipu', label: '智谱 GLM', hint: 'BigModel API' },
  { value: 'minimax', label: 'MiniMax', hint: 'MiniMax API' },
  { value: 'openai_compatible', label: '兼容接口', hint: 'Ollama / vLLM / 其他 OpenAI 兼容服务' },
];

const PROVIDER_DEFAULT_BASE_URL: Partial<Record<Provider, string>> = {
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
};

export default function OnboardingPage() {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelFast, setModelFast] = useState('');
  const [modelSmart, setModelSmart] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startingDemo, setStartingDemo] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    window.dailyNote?.getConfig().then((next) => {
      setConfig(next);
      const p = (next.llmProvider || 'openai') as Provider;
      setProvider(p);
      setBaseUrl(next.providerBaseUrl || '');
      setModelFast(next.modelFastOverride || '');
      setModelSmart(next.modelSmartOverride || '');
      // Show masked key based on which provider has a key configured
      if (p === 'openai') {
        setApiKey(next.hasOpenAIKey ? '********' : '');
      } else {
        setApiKey(next.hasProviderKey ? '********' : '');
      }
    });
  }, []);

  const chooseDir = async () => {
    const dir = await window.dailyNote?.chooseDataDir();
    if (dir) setConfig((prev) => prev ? { ...prev, dataDir: dir } : prev);
  };

  const saveConfig = async (done = false) => {
    if (!config || !window.dailyNote) return false;
    setSaving(true);
    try {
      const payload: Parameters<NonNullable<typeof window.dailyNote>['saveConfig']>[0] = {
        dataDir: config.dataDir,
        llmProvider: provider,
        httpsProxy: config.httpsProxy,
        modelFastOverride: modelFast,
        modelSmartOverride: modelSmart,
        globalShortcut: config.globalShortcut,
        hasCompletedOnboarding: done,
      };
      // Route key to the right field
      if (provider === 'openai') {
        payload.openaiApiKey = apiKey;
        payload.providerApiKey = apiKey;
        payload.providerBaseUrl = baseUrl || undefined;
      } else {
        payload.providerApiKey = apiKey;
        payload.providerBaseUrl = baseUrl || undefined;
      }
      await window.dailyNote.saveConfig(payload);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const saved = await saveConfig(false);
    if (!saved) {
      setTesting(false);
      return;
    }
    try {
      const res = await fetch('/api/app-status/test-openai', { method: 'POST' });
      const data = await res.json();
      setTestResult(data.ok ? `连接成功，检测到 ${data.modelCount} 个模型。` : `${data.error}\n${data.hint ?? ''}`);
    } finally {
      setTesting(false);
    }
  };

  const finish = async () => {
    const ok = await saveConfig(true);
    if (ok) router.push('/');
  };

  const startDemo = async () => {
    if (!config || !window.dailyNote || startingDemo) return;
    setStartingDemo(true);
    setTestResult(null);
    try {
      await window.dailyNote.saveConfig({
        dataDir: config.dataDir,
        llmProvider: provider,
        httpsProxy: config.httpsProxy,
        modelFastOverride: modelFast,
        modelSmartOverride: modelSmart,
        globalShortcut: config.globalShortcut,
        hasCompletedOnboarding: true,
      });
      const res = await fetch('/api/demo-seed', { method: 'POST' });
      if (!res.ok && res.status !== 409) {
        const data = await res.json().catch(() => ({}));
        setTestResult(data.error || 'Demo 数据生成失败。');
        return;
      }
      router.push('/');
    } finally {
      setStartingDemo(false);
    }
  };

  if (mounted && !window.dailyNote) {
    return (
      <main className="mx-auto max-w-xl py-16">
        <h1 className="text-2xl font-medium">DailyNote Mac</h1>
        <p className="mt-4 text-sm leading-7 text-ink-faint">
          首次启动向导只在 Mac app 中可用。当前看起来是在普通浏览器里打开。
        </p>
      </main>
    );
  }

  if (!mounted || !config) return <p className="text-sm text-ink-faint">加载中...</p>;

  const needsBaseUrl =
    provider === 'openai_compatible' ||
    provider === 'openai' ||
    provider === 'qwen' ||
    provider === 'zhipu' ||
    provider === 'minimax';
  const needsModelNames = provider === 'openai_compatible' || provider === 'anthropic';
  const keyPlaceholder = provider === 'anthropic'
    ? 'sk-ant-...'
    : provider === 'openai_compatible'
    ? '可留空'
    : 'sk-...';
  const keyLabel = provider === 'openai'
    ? 'OpenAI API key'
    : provider === 'anthropic'
    ? 'Anthropic API key'
    : provider === 'openai_compatible'
    ? 'API key（可选）'
    : 'API key';

  return (
    <main className="mx-auto max-w-2xl py-8">
      <p className="text-[11px] uppercase tracking-wider text-ink-faint">DailyNote Mac</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight">先把日常记录变简单</h1>
      <p className="mt-3 text-[14px] leading-7 text-ink-soft">
        选择数据保存位置和 AI 提供商。之后你只需要打开应用写下想法，整理会在后台发生。
      </p>
      <section className="mt-6 rounded-2xl border border-line bg-paper p-5">
        <p className="text-[13px] font-medium text-ink">先体验一遍 DailyNote</p>
        <p className="mt-2 text-[13px] leading-6 text-ink-soft">
          不想马上配置 API key 的话，可以先载入一组示例笔记。你会直接看到首页回顾、自动主题、人物和相关旧想法。
        </p>
        <button
          onClick={startDemo}
          disabled={startingDemo || saving}
          className="mt-4 rounded-full bg-accent-dark px-5 py-2 text-[13px] font-medium text-paper disabled:opacity-50"
        >
          {startingDemo ? '准备 Demo...' : '试用 Demo'}
        </button>
      </section>

      <section className="mt-8 space-y-5 rounded-2xl bg-canvas p-5">
        <div>
          <label className="mb-2 block text-[12px] text-ink-faint">数据保存位置</label>
          <div className="flex gap-2">
            <input
              value={config.dataDir}
              onChange={(e) => setConfig({ ...config, dataDir: e.target.value })}
              className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none"
            />
            <button onClick={chooseDir} className="rounded-xl border border-line px-3 py-2 text-[13px] text-ink-soft">
              选择
            </button>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[12px] text-ink-faint">AI 提供商</label>
          <div className="flex gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  setProvider(p.value);
                  setApiKey('');
                  setBaseUrl(PROVIDER_DEFAULT_BASE_URL[p.value] ?? '');
                  setModelFast('');
                  setModelSmart('');
                  setTestResult(null);
                }}
                className={`flex-1 rounded-xl border px-3 py-2 text-[13px] transition ${
                  provider === p.value
                    ? 'border-accent bg-accent/5 text-accent'
                    : 'border-line text-ink-soft hover:border-accent/40'
                }`}
              >
                <span className="font-medium">{p.label}</span>
                <span className="mt-0.5 block text-[11px] opacity-60">{p.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[12px] text-ink-faint">{keyLabel}</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
            placeholder={keyPlaceholder}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none"
          />
        </div>

        {needsBaseUrl && (
          <div>
            <label className="mb-2 block text-[12px] text-ink-faint">
              {provider === 'openai_compatible' ? '接口地址' : '自定义地址（可选）'}
            </label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={PROVIDER_DEFAULT_BASE_URL[provider] || (provider === 'openai_compatible' ? 'http://localhost:11434/v1' : 'https://api.openai.com')}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none"
            />
          </div>
        )}

        {needsModelNames && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-[12px] text-ink-faint">快速分析模型</label>
              <input
                value={modelFast}
                onChange={(e) => setModelFast(e.target.value)}
                placeholder={provider === 'openai_compatible' ? 'qwen2.5:7b' : 'claude-sonnet-4-20250514'}
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-[12px] text-ink-faint">深度总结模型</label>
              <input
                value={modelSmart}
                onChange={(e) => setModelSmart(e.target.value)}
                placeholder={provider === 'openai_compatible' ? 'qwen2.5:14b' : 'claude-sonnet-4-20250514'}
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-2 block text-[12px] text-ink-faint">HTTPS_PROXY（可选）</label>
          <input
            value={config.httpsProxy}
            onChange={(e) => setConfig({ ...config, httpsProxy: e.target.value })}
            placeholder="http://127.0.0.1:1087"
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-[12px] text-ink-faint">全局快捷键</label>
          <input
            value={config.globalShortcut}
            onChange={(e) => setConfig({ ...config, globalShortcut: e.target.value })}
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none"
          />
        </div>
      </section>

      {testResult && (
        <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-line bg-paper p-3 text-[12px] leading-6 text-ink-soft">
          {testResult}
        </pre>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          onClick={testConnection}
          disabled={testing || saving}
          className="rounded-full border border-line px-4 py-2 text-[13px] text-ink-soft disabled:opacity-50"
        >
          {testing ? '测试中...' : '测试连接'}
        </button>
        <button
          onClick={finish}
          disabled={saving}
          className="rounded-full bg-accent-dark px-5 py-2 text-[13px] font-medium text-paper disabled:opacity-50"
        >
          {saving ? '保存中...' : '开始使用'}
        </button>
      </div>
    </main>
  );
}
