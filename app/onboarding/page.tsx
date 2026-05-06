'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Config = Awaited<ReturnType<NonNullable<typeof window.dailyNote>['getConfig']>>;

export default function OnboardingPage() {
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    window.dailyNote?.getConfig().then((next) => {
      setConfig(next);
      setApiKey(next.hasOpenAIKey ? '********' : '');
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
      await window.dailyNote.saveConfig({
        dataDir: config.dataDir,
        openaiApiKey: apiKey,
        httpsProxy: config.httpsProxy,
        globalShortcut: config.globalShortcut,
        hasCompletedOnboarding: done,
      });
      return true;
    } finally {
      setSaving(false);
    }
  };

  const testOpenAI = async () => {
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

  return (
    <main className="mx-auto max-w-2xl py-8">
      <p className="text-[11px] uppercase tracking-wider text-ink-faint">DailyNote Mac</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight">先把日常记录变简单</h1>
      <p className="mt-3 text-[14px] leading-7 text-ink-soft">
        选择数据保存位置，填入 OpenAI API key。之后你只需要打开应用写下想法，整理会在后台发生。
      </p>

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
          <label className="mb-2 block text-[12px] text-ink-faint">OpenAI API key</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type="password"
            placeholder="sk-..."
            className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-[13px] outline-none"
          />
        </div>

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
          onClick={testOpenAI}
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
