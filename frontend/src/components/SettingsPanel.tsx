import { useState, useEffect, useRef, useCallback } from "react";
import type { AppSettings } from "../types/stock";

interface SettingsPanelProps {
  settings: AppSettings & { tushare_api_key?: string };
  onSettingsChanged: (settings: AppSettings & { tushare_api_key?: string }) => void;
}

export default function SettingsPanel({ settings, onSettingsChanged }: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings & { tushare_api_key?: string }>(settings);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const saveSettings = useCallback(async (updated: Partial<AppSettings & { tushare_api_key?: string }>) => {
    setSaving(true);
    try {
      const res = await fetch("http://localhost:8000/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const json = await res.json();
      if (json.success) {
        const newSettings: AppSettings & { tushare_api_key?: string } = {
          data_source: json.data_source,
          global_start_date: json.global_start_date,
          global_end_date: json.global_end_date,
          tushare_api_key: json.tushare_api_key ?? localSettings.tushare_api_key,
        };
        setLocalSettings(newSettings);
        onSettingsChanged(newSettings);
      }
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setSaving(false);
    }
  }, [onSettingsChanged, localSettings.tushare_api_key]);

  const debouncedSave = useCallback((patch: Partial<AppSettings>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveSettings(patch), 800);
  }, [saveSettings]);

  const handleDataSourceChange = (value: string) => {
    const ds = value as AppSettings["data_source"];
    setLocalSettings((prev) => ({ ...prev, data_source: ds }));
    saveSettings({ data_source: ds });
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
        <h2 className="text-xl font-bold text-tv-text mb-6">Settings</h2>

        {/* Data Source */}
        <div className="bg-tv-panel border border-tv-border rounded-lg p-5 mb-4">
          <h3 className="text-sm font-semibold text-tv-text mb-3">Data Source</h3>
          <p className="text-xs text-tv-muted mb-3">
            Choose where stock market data is fetched from.
          </p>
          <select
            value={localSettings.data_source}
            onChange={(e) => handleDataSourceChange(e.target.value)}
            disabled={saving}
            className="bg-tv-base text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue cursor-pointer w-full"
          >
            <option value="yahoo_finance">Yahoo Finance (Free)</option>
            <option value="moomoo_opend">Moomoo OpenD (Real-time)</option>
            <option value="tushare">Tushare (Chinese & US Stocks)</option>
          </select>

          {localSettings.data_source === "moomoo_opend" && (
            <div className="mt-3 bg-amber-900/20 border border-amber-600/30 rounded px-3 py-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-amber-400 text-xs font-medium">
                  Moomoo OpenD gateway is not configured. Data fetching will fail until the gateway is installed and connected.
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
                  Tushare API key is required. Data fetching will fail until the API key is configured.
                </span>
              </div>
            </div>
          )}

          {/* Tushare API Key */}
          {localSettings.data_source === "tushare" && (
            <div className="mt-4">
              <label className="text-xs text-tv-muted block mb-1">Tushare API Key</label>
              <input
                type="text"
                value={localSettings.tushare_api_key || ""}
                onChange={(e) => {
                  setLocalSettings((prev) => ({ ...prev, tushare_api_key: e.target.value }));
                  saveSettings({ tushare_api_key: e.target.value });
                }}
                disabled={saving}
                placeholder="Enter your Tushare API key"
                className="bg-tv-base text-tv-text text-sm border border-tv-border rounded px-3 py-2 outline-none focus:border-tv-blue w-full"
              />
              <p className="text-xs text-tv-muted mt-1">
                Get your API key from <a href="https://tushare.pro/" target="_blank" rel="noopener noreferrer" className="text-tv-blue hover:underline">Tushare.pro</a>
              </p>
            </div>
          )}
        </div>

        {/* Global Data Timeline */}
        <div className="bg-tv-panel border border-tv-border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-tv-text mb-3">Global Data Timeline</h3>
          <p className="text-xs text-tv-muted mb-3">
            Set a default date range for data fetching. Leave empty to use each tool's default period.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-tv-muted block mb-1">Start Date</label>
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
              <label className="text-xs text-tv-muted block mb-1">End Date</label>
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
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
