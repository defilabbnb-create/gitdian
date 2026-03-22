'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { updateSettings } from '@/lib/api/settings';
import { SettingsPayload, UpdateSettingsPayload } from '@/lib/types/settings';
import { SettingsActions } from './settings-actions';
import { SettingsSection } from './settings-section';

type SettingsFormProps = {
  initialSettings: SettingsPayload;
};

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [settings, setSettings] = useState<SettingsPayload>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function updateField(path: string, value: string | number | boolean | null) {
    setSettings((current) => {
      const next = structuredClone(current);
      const parts = path.split('.');
      let target: Record<string, unknown> = next as unknown as Record<string, unknown>;

      for (let index = 0; index < parts.length - 1; index += 1) {
        target = target[parts[index]] as Record<string, unknown>;
      }

      target[parts[parts.length - 1]] = value;
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const payload = toUpdatePayload(settings);
      const updated = await updateSettings(payload);
      setSettings(updated);
      setSaveMessage('配置已保存并回显最新值。');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '保存配置失败，请稍后重试。',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SettingsSection
        title="GitHub 采集配置"
        description="控制默认搜索方式、分页大小、星数范围，以及采集完成后是否默认执行规则粗筛。"
      >
        <SelectField
          label="默认采集模式"
          value={settings.github.search.defaultMode}
          onChange={(value) => updateField('github.search.defaultMode', value)}
          options={[
            { value: 'updated', label: '最近更新项目' },
            { value: 'created', label: '最近创建项目' },
          ]}
        />
        <SelectField
          label="默认排序"
          value={settings.github.search.defaultSort}
          onChange={(value) => updateField('github.search.defaultSort', value)}
          options={[
            { value: 'updated', label: 'updated' },
            { value: 'stars', label: 'stars' },
          ]}
        />
        <SelectField
          label="默认顺序"
          value={settings.github.search.defaultOrder}
          onChange={(value) => updateField('github.search.defaultOrder', value)}
          options={[
            { value: 'desc', label: 'desc' },
            { value: 'asc', label: 'asc' },
          ]}
        />
        <NumberField
          label="默认每页数量"
          value={settings.github.search.defaultPerPage}
          onChange={(value) => updateField('github.search.defaultPerPage', value)}
          min={1}
          max={50}
        />
        <NumberField
          label="默认最小 Stars"
          value={settings.github.search.defaultStarMin}
          onChange={(value) => updateField('github.search.defaultStarMin', value)}
          min={0}
          allowEmpty
        />
        <NumberField
          label="默认最大 Stars"
          value={settings.github.search.defaultStarMax}
          onChange={(value) => updateField('github.search.defaultStarMax', value)}
          min={0}
          allowEmpty
        />
        <NumberField
          label="默认 pushedAfterDays"
          value={settings.github.search.defaultPushedAfterDays}
          onChange={(value) => updateField('github.search.defaultPushedAfterDays', value)}
          min={0}
          allowEmpty
        />
        <ToggleField
          label="采集后默认运行 Fast Filter"
          checked={settings.github.fetch.runFastFilterByDefault}
          onChange={(checked) =>
            updateField('github.fetch.runFastFilterByDefault', checked)
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Fast Filter 配置"
        description="控制规则粗筛的默认批处理规模、是否只筛未筛项目，以及分数阈值和 stale 判定。"
      >
        <NumberField
          label="批量默认 limit"
          value={settings.fastFilter.batch.defaultLimit}
          onChange={(value) => updateField('fastFilter.batch.defaultLimit', value)}
          min={1}
          max={200}
        />
        <ToggleField
          label="默认只筛未处理仓库"
          checked={settings.fastFilter.onlyUnscreenedByDefault}
          onChange={(checked) =>
            updateField('fastFilter.onlyUnscreenedByDefault', checked)
          }
        />
        <NumberField
          label="过期天数阈值"
          value={settings.fastFilter.staleDaysThreshold}
          onChange={(value) => updateField('fastFilter.staleDaysThreshold', value)}
          min={1}
        />
        <NumberField
          label="A级阈值"
          value={settings.fastFilter.scoreThresholdA}
          onChange={(value) => updateField('fastFilter.scoreThresholdA', value)}
          min={0}
          max={100}
        />
        <NumberField
          label="B级阈值"
          value={settings.fastFilter.scoreThresholdB}
          onChange={(value) => updateField('fastFilter.scoreThresholdB', value)}
          min={0}
          max={100}
        />
      </SettingsSection>

      <SettingsSection
        title="AI 路由与模型配置"
        description="控制默认 provider、fallback 策略、各 taskType 路由以及 OMLX / OpenAI 的模型名和超时。当前推荐默认保持在纯本地 OMLX 模式，OpenAI 作为可选增强。"
      >
        <SelectField
          label="默认 Provider"
          value={settings.ai.defaultProvider}
          onChange={(value) => updateField('ai.defaultProvider', value)}
          options={[
            { value: 'omlx', label: 'omlx' },
            { value: 'openai', label: 'openai' },
          ]}
        />
        <SelectField
          label="Fallback Provider"
          value={settings.ai.fallbackProvider}
          onChange={(value) => updateField('ai.fallbackProvider', value)}
          options={[
            { value: 'omlx', label: 'omlx' },
            { value: 'openai', label: 'openai' },
          ]}
        />
        <ToggleField
          label="启用 Fallback"
          checked={settings.ai.enableFallback}
          onChange={(checked) => updateField('ai.enableFallback', checked)}
        />
        <NumberField
          label="AI Timeout (ms)"
          value={settings.ai.timeoutMs}
          onChange={(value) => updateField('ai.timeoutMs', value)}
          min={1000}
          max={120000}
        />
        <SelectField
          label="rough_filter 路由"
          value={settings.ai.taskRouting.rough_filter}
          onChange={(value) => updateField('ai.taskRouting.rough_filter', value)}
          options={providerOptions}
        />
        <SelectField
          label="completeness 路由"
          value={settings.ai.taskRouting.completeness}
          onChange={(value) => updateField('ai.taskRouting.completeness', value)}
          options={providerOptions}
        />
        <SelectField
          label="idea_fit 路由"
          value={settings.ai.taskRouting.idea_fit}
          onChange={(value) => updateField('ai.taskRouting.idea_fit', value)}
          options={providerOptions}
        />
        <SelectField
          label="idea_extract 路由"
          value={settings.ai.taskRouting.idea_extract}
          onChange={(value) => updateField('ai.taskRouting.idea_extract', value)}
          options={providerOptions}
        />
        <TextField
          label="OMLX Model"
          value={settings.ai.models.omlx ?? ''}
          onChange={(value) => updateField('ai.models.omlx', value || null)}
          placeholder="local-122b"
        />
        <TextField
          label="OpenAI Model"
          value={settings.ai.models.openai ?? ''}
          onChange={(value) => updateField('ai.models.openai', value || null)}
          placeholder="gpt-5"
        />
      </SettingsSection>

      <SettingsActions
        isSaving={isSaving}
        saveMessage={saveMessage}
        errorMessage={errorMessage}
      />
    </form>
  );
}

const providerOptions = [
  { value: 'omlx', label: 'omlx' },
  { value: 'openai', label: 'openai' },
];

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  allowEmpty = false,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const nextValue = event.target.value;
          if (allowEmpty && nextValue === '') {
            onChange(null);
            return;
          }

          onChange(Number(nextValue));
        }}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-400"
      />
    </label>
  );
}

function toUpdatePayload(settings: SettingsPayload): UpdateSettingsPayload {
  return {
    github: settings.github,
    fastFilter: settings.fastFilter,
    ai: {
      defaultProvider: settings.ai.defaultProvider,
      fallbackProvider: settings.ai.fallbackProvider,
      enableFallback: settings.ai.enableFallback,
      taskRouting: {
        rough_filter: settings.ai.taskRouting.rough_filter,
        completeness: settings.ai.taskRouting.completeness,
        basic_analysis: settings.ai.taskRouting.basic_analysis,
        idea_fit: settings.ai.taskRouting.idea_fit,
        idea_extract: settings.ai.taskRouting.idea_extract,
      },
      models: settings.ai.models,
      timeoutMs: settings.ai.timeoutMs,
    },
  };
}
