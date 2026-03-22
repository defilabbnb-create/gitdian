type SettingsActionsProps = {
  isSaving: boolean;
  saveMessage: string | null;
  errorMessage: string | null;
};

export function SettingsActions({
  isSaving,
  saveMessage,
  errorMessage,
}: SettingsActionsProps) {
  return (
    <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-900">系统配置保存</p>
        {saveMessage ? (
          <p className="text-sm text-emerald-700">{saveMessage}</p>
        ) : errorMessage ? (
          <p className="text-sm text-rose-700">{errorMessage}</p>
        ) : (
          <p className="text-sm text-slate-500">修改后点击保存，后端会返回规范化后的最新配置。</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? '保存中...' : '保存配置'}
      </button>
    </div>
  );
}
