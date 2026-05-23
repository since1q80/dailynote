export {};

declare global {
  interface Window {
    dailyNote?: {
      getConfig: () => Promise<{
        dataDir: string;
        llmProvider: string;
        providerApiKey: string;
        providerBaseUrl: string;
        modelFastOverride: string;
        modelSmartOverride: string;
        openaiApiKey: string;
        httpsProxy: string;
        hasCompletedOnboarding: boolean;
        globalShortcut: string;
        hasOpenAIKey: boolean;
        hasProviderKey: boolean;
      }>;
      saveConfig: (config: {
        dataDir?: string;
        llmProvider?: string;
        providerApiKey?: string;
        providerBaseUrl?: string;
        modelFastOverride?: string;
        modelSmartOverride?: string;
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
