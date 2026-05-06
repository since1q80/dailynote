export {};

declare global {
  interface Window {
    dailyNote?: {
      getConfig: () => Promise<{
        dataDir: string;
        openaiApiKey: string;
        httpsProxy: string;
        hasCompletedOnboarding: boolean;
        globalShortcut: string;
        hasOpenAIKey: boolean;
      }>;
      saveConfig: (config: {
        dataDir?: string;
        openaiApiKey?: string;
        httpsProxy?: string;
        hasCompletedOnboarding?: boolean;
        globalShortcut?: string;
      }) => Promise<{ ok: boolean }>;
      chooseDataDir: () => Promise<string | null>;
      openDataDir: () => Promise<void>;
      restartServer: () => Promise<{ ok: boolean }>;
      showMainWindow: () => Promise<void>;
      closeQuickCapture: () => Promise<void>;
      noteSaved: () => Promise<void>;
      onNoteSaved: (callback: () => void) => () => void;
    };
  }
}
