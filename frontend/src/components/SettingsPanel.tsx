import { useState, useEffect, useRef, useCallback } from "react";
import type { AppSettings } from "../types/stock";
import type { Translation } from "../i18n";

type ExtendedSettings = AppSettings & {
  tushare_api_key?: string;
  binance_api_key?: string;
  binance_api_secret?: string;
};

interface SettingsPanelProps {
  settings: ExtendedSettings;
  onSettingsChanged: (settings: ExtendedSettings) => void;
  t: Translation;
}

export default function SettingsPanel({ settings, onSettingsChanged, t }: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<ExtendedSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [binanceTestStatus, setBinanceTestStatus] = useState<{
    loading: boolean;
    result: { success: boolean; message: string; authenticated: boolean } | null;
  }>({ loading: false, result: null });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const saveSettings = useCallback(async (updated: Partial<ExtendedSettings>) => {
    setSaving(true);
    try {
      const res = await fetch("http://localhost:8000/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const json = await res.json();
      if (json.success) {
        const newSettings: ExtendedSettings = {
          data_source: json.data_source,
          global_start_date: json.global_start_date,
          global_end_date: json.global_end_date,
          tushare_api_key: json.tushare_api_key ?? localSettings.tushare_api_key,
          binance_api_key: json.binance_api_key ?? localSettings.binance_api_key,
          binance_api_secret: json.binance_api_secret ?? localSettings.binance_api_secret,
        };
        setLocalSettings(newSettings);
        onSettingsChanged(newSettings);
      }
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  }, [onSettingsChanged, localSettings.tushare_api_key, localSettings.binance_api_key, localSettings.binance_api_secret]);

  const debouncedSave = useCallback((patch: Partial<ExtendedSettings>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveSettings(patch), 800);
  }, [saveSettings]);

  const testBinanceConnection = useCallback(async () => {
    setBinanceTestStatus({ loading: true, result: null });
    try {
      const res = await fetch("http://localhost:8000/api/binance/validate", { method: "POST" });
      const json = await res.json();
      setBinanceTestStatus({ loading: false, result: json });
    } catch {
      setBinanceTestStatus({
        loading: false,
        result: { success: false, message: "Cannot reach backend.", authenticated: false },
      });
    }
  }, []);

  const handleDataSourceChange = (value: string) => {
    const ds = value as AppSettings["data_source"];
    setLocalSettings((prev) => ({ ...prev, data_source: ds }));
    saveSettings({ data_source: ds });
    setBinanceTestStatus({ loading: false, result: null });
  };

  const handleStartDateChange = (value: string) => {
    setLocalSettings((prev) => ({ ...prev, global_start_date: value }));
    // Only save if it's a complete date (YYYY-MM-DD) or empty
    if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      debouncedSave({ global_start_date: value });
    }
  };

  const handleEndDateChange = (value: string) => {
    setLocalSettings((prev) => ({ ...prev, global_end_date: value }));
    if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      debouncedSave({ global_end_date: value });
    }
  };

  const clearDates = () => {
    setLocalSettings((prev) => ({ ...prev, global_start_date: "", global_end_date: "" }));
    saveSettings({ global_start_date: "", global_end_date: "" });
  };

  return (
    <div className="flex-1 flex flex-col bg-tv-base min-w-0 overflow-auto">
      <div className="max-w-2xl mx-auto w-full px-6 py-8">
        <h2 className="text-xl font-bold text-tv-text mb-6">{t.settings}</h2>

        {/* Data Source */}
        <div className="bg-tv-panel border border-tv-border rounded-lg p-5 mb-4">
          <h3 className="text-sm font-semibold text-tv-text mb-3">{t.dataSource}</h3>
          <p className="text-xs text-tv-muted mb-3">
            {t.chooseDataSource}
          </p>
          <select
            value={localSettings.data_source}
            onChange={(e) => handleDataSourceChange(e.target.value)}
            disabled={saving}
            className="bg-tv-base text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue cursor-pointer w-full"
          >
            <option value="yahoo_finance">{t.yahooFinance}</option>
            <option value="moomoo_opend">{t.moomooOpenD}</option>
            <option value="tushare">{t.tushare}</option>
            <option value="binance">{t.binance}</option>
          </select>

          {localSettings.data_source === "moomoo_opend" && (
            <div className="mt-3 bg-amber-900/20 border border-amber-600/30 rounded px-3 py-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-amber-400 text-xs font-medium">
                  {t.moomooNotConfigured}
                </span>
              </div>
            </div>
          )}

          {localSettings.data_source === "tushare" && (
            <div className="mt-3 bg-blue-900/20 border border-blue-600/30 rounded px-3 py-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-blue-400 text-xs font-medium">
                  {t.tushareApiKeyRequired}
                </span>
              </div>
            </div>
          )}

          {/* Tushare API Key */}
          {localSettings.data_source === "tushare" && (
            <div className="mt-4">
              <label className="text-xs text-tv-muted block mb-1">{t.tushareApiKey}</label>
              <input
                type="text"
                value={localSettings.tushare_api_key || ""}
                onChange={(e) => {
                  setLocalSettings((prev) => ({ ...prev, tushare_api_key: e.target.value }));
                  saveSettings({ tushare_api_key: e.target.value });
                }}
                disabled={saving}
                placeholder={t.enterTushareApiKey}
                className="bg-tv-base text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue w-full"
              />
              <p className="text-xs text-tv-muted mt-1">
                {t.getTushareApiKey} <a href="https://tushare.pro/" target="_blank" rel="noopener noreferrer" className="text-tv-blue hover:underline">Tushare.pro</a>
              </p>
            </div>
          )}

          {/* Binance notice */}
          {localSettings.data_source === "binance" && (
            <div className="mt-3 bg-yellow-900/20 border border-yellow-600/30 rounded px-3 py-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-yellow-400 text-xs font-medium">
                  {t.binancePublicDataNote}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Binance API Settings */}
        {localSettings.data_source === "binance" && (
          <div className="bg-tv-panel border border-tv-border rounded-lg p-5 mb-4">
            <h3 className="text-sm font-semibold text-tv-text mb-1">{t.binanceApiSettings}</h3>
            <p className="text-xs text-tv-muted mb-4">{t.binanceApiDescription}</p>

            {/* API Key */}
            <div className="mb-3">
              <label className="text-xs text-tv-muted block mb-1">{t.binanceApiKey}</label>
              <input
                type="text"
                value={localSettings.binance_api_key || ""}
                onChange={(e) => {
                  setLocalSettings((prev) => ({ ...prev, binance_api_key: e.target.value }));
                  setBinanceTestStatus({ loading: false, result: null });
                  debouncedSave({ binance_api_key: e.target.value });
                }}
                disabled={saving}
                placeholder={t.binanceApiKeyPlaceholder}
                className="bg-tv-base text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue w-full font-mono"
              />
            </div>

            {/* API Secret */}
            <div className="mb-4">
              <label className="text-xs text-tv-muted block mb-1">{t.binanceApiSecret}</label>
              <div className="flex gap-2">
                <input
                  type={showSecret ? "text" : "password"}
                  value={localSettings.binance_api_secret || ""}
                  onChange={(e) => {
                    setLocalSettings((prev) => ({ ...prev, binance_api_secret: e.target.value }));
                    setBinanceTestStatus({ loading: false, result: null });
                    debouncedSave({ binance_api_secret: e.target.value });
                  }}
                  disabled={saving}
                  placeholder={t.binanceApiSecretPlaceholder}
                  className="bg-tv-base text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue flex-1 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="text-xs text-tv-muted hover:text-tv-text border border-tv-border rounded px-3 py-2 transition cursor-pointer shrink-0"
                  title={showSecret ? t.hideSecret : t.showSecret}
                >
                  {showSecret ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-xs text-tv-muted mt-1">{t.binanceApiSecretNote}</p>
            </div>

            {/* Test Connection */}
            <div className="flex items-center gap-3">
              <button
                onClick={testBinanceConnection}
                disabled={binanceTestStatus.loading || saving}
                className="text-xs bg-tv-blue text-white rounded px-4 py-2 hover:bg-blue-600 disabled:opacity-50 transition cursor-pointer"
              >
                {binanceTestStatus.loading ? t.testingConnection : t.testConnection}
              </button>

              {binanceTestStatus.result && (
                <div className={`flex items-center gap-1.5 text-xs ${binanceTestStatus.result.success ? "text-green-400" : "text-red-400"}`}>
                  {binanceTestStatus.result.success ? (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span>{binanceTestStatus.result.message}</span>
                  {binanceTestStatus.result.success && binanceTestStatus.result.authenticated && (
                    <span className="text-green-500 font-medium ml-1">({t.authenticated})</span>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-tv-muted mt-3">
              {t.binanceApiKeyGuide}{" "}
              <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noopener noreferrer" className="text-tv-blue hover:underline">
                binance.com
              </a>
              . {t.binanceReadOnlySufficient}
            </p>
          </div>
        )}

        {/* Global Data Timeline */}
        <div className="bg-tv-panel border border-tv-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-tv-text mb-3">{t.globalDataTimeline}</h3>
          <p className="text-xs text-tv-muted mb-3">
            {t.setDateRange}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-tv-muted block mb-1">{t.startDate}</label>
              <input
                type="date"
                value={localSettings.global_start_date}
                onChange={(e) => handleStartDateChange(e.target.value)}
                disabled={saving}
                className="bg-tv-base text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue w-full"
                style={{ colorScheme: "dark" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-tv-muted block mb-1">{t.endDate}</label>
              <input
                type="date"
                value={localSettings.global_end_date}
                onChange={(e) => handleEndDateChange(e.target.value)}
                disabled={saving}
                className="bg-tv-base text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue w-full"
                style={{ colorScheme: "dark" }}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={clearDates}
                disabled={saving || (!localSettings.global_start_date && !localSettings.global_end_date)}
                className="text-xs text-tv-muted hover:text-tv-text disabled:opacity-30 border border-tv-border rounded px-3 py-2 mt-4 transition cursor-pointer"
              >
                {t.clear}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
