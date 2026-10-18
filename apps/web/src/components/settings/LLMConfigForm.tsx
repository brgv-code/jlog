import { REASONING_EFFORTS, type ReasoningEffort } from '@jlog/shared';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { type ModelList, defaultModel, fetchModels, modelLabel } from '../../lib/llmModels';

type Provider = 'anthropic' | 'openai' | 'gemini' | 'ollama';

interface LLMConfig {
  provider: Provider;
  model: string;
  ollamaUrl: string | null;
  reasoningEffort?: ReasoningEffort;
  hasApiKey: boolean;
}

/** Ollama lists what is installed locally; the hosted providers come from the catalogue. */
const OLLAMA_DEFAULT = 'llama3';

/** The select value that switches the model field to a free text id. */
const CUSTOM = '__custom__';

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  default: 'Default (the provider decides)',
  low: 'Low: fastest and cheapest',
  medium: 'Medium',
  high: 'High: slowest, most thorough',
};

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Gemini',
  ollama: 'Ollama (local)',
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--color-surface-raised)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box' as const,
};

const labelStyle = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-secondary)',
  marginBottom: '4px',
};

export function LLMConfigForm() {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [model, setModel] = useState('');
  const [custom, setCustom] = useState(false);
  const [list, setList] = useState<ModelList | null>(null);
  const [listing, setListing] = useState(false);
  const [effort, setEffort] = useState<ReasoningEffort>('default');
  const [apiKey, setApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    apiFetch('/api/llm/config')
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { config: LLMConfig | null };
        if (data.config) {
          setConfig(data.config);
          setProvider(data.config.provider);
          setModel(data.config.model);
          setEffort(data.config.reasoningEffort ?? 'default');
          setOllamaUrl(data.config.ollamaUrl ?? 'http://localhost:11434');
        }
      })
      .catch(() => {});
  }, []);

  // Fetch available models from local Ollama whenever the URL changes and Ollama is selected
  useEffect(() => {
    if (provider !== 'ollama') return;
    fetch(`${ollamaUrl}/api/tags`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { models?: { name: string }[] };
        const names = (data.models ?? []).map((m) => m.name);
        setOllamaModels(names);
        if (names.length > 0 && !names.includes(model)) {
          setModel(names[0] ?? OLLAMA_DEFAULT);
        }
      })
      .catch(() => setOllamaModels([]));
  }, [provider, ollamaUrl, model]);

  // The catalogue for a hosted provider, and which of it the key can call.
  // Re-asked when a new key is typed, so access is checked before saving.
  function loadModels(p: Provider, key?: string, preselect = false) {
    if (p === 'ollama') {
      setList(null);
      return;
    }
    setListing(true);
    fetchModels(p, key)
      .then((next) => {
        setList(next);
        if (preselect && next) {
          setModel(defaultModel(next));
          setCustom(false);
        }
      })
      .finally(() => setListing(false));
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the provider changes, not on every keystroke in the key field
  useEffect(() => {
    loadModels(provider);
  }, [provider]);

  // A saved model the catalogue does not list (a fine-tune, an older id, a
  // model newer than the catalogue) stays as typed rather than being replaced.
  // Nothing saved yet gets the newest model this key can call.
  useEffect(() => {
    if (!list) return;
    if (!model && !custom) setModel(defaultModel(list));
    else if (model && !list.models.some((m) => m.id === model)) setCustom(true);
  }, [list, model, custom]);

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(p === 'ollama' ? OLLAMA_DEFAULT : '');
    setCustom(false);
    loadModels(p, undefined, true);
  }

  const selected = list?.models.find((m) => m.id === model);
  const latest = list ? list.models.filter((m) => list.latest.includes(m.id)) : [];
  const rest = list ? list.models.filter((m) => !list.latest.includes(m.id)) : [];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setErrorMsg('');

    try {
      const body: Record<string, string> = { provider, model, reasoningEffort: effort };
      if (apiKey) body.apiKey = apiKey;
      if (provider === 'ollama') body.ollamaUrl = ollamaUrl;

      const res = await apiFetch('/api/llm/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        setErrorMsg(data.error?.message ?? 'Failed to save');
        setStatus('error');
        return;
      }

      const data = (await res.json()) as { config: LLMConfig };
      setConfig(data.config);
      setApiKey('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setErrorMsg('Network error — please try again');
      setStatus('error');
    }
  }

  return (
    <form
      onSubmit={handleSave}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >
      <div>
        <label htmlFor="llm-provider" style={labelStyle}>
          Provider
        </label>
        <select
          id="llm-provider"
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as Provider)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {(Object.entries(PROVIDER_LABELS) as [Provider, string][]).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="llm-model" style={labelStyle}>
          Model
          {provider === 'ollama' && ollamaModels.length === 0 && (
            <span style={{ color: 'var(--color-text-tertiary)', marginLeft: '6px' }}>
              (Ollama not detected at {ollamaUrl})
            </span>
          )}
        </label>
        {provider === 'ollama' && ollamaModels.length > 0 ? (
          <select
            id="llm-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {ollamaModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : provider !== 'ollama' && list && list.models.length > 0 ? (
          <>
            <select
              id="llm-model"
              value={custom ? CUSTOM : model}
              onChange={(e) => {
                if (e.target.value === CUSTOM) {
                  setCustom(true);
                  return;
                }
                setCustom(false);
                setModel(e.target.value);
              }}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <optgroup label="Latest">
                {latest.map((m) => (
                  <option key={m.id} value={m.id}>
                    {modelLabel(m, list.available)}
                  </option>
                ))}
              </optgroup>
              {rest.length > 0 && (
                <optgroup label={`All ${PROVIDER_LABELS[provider]} models`}>
                  {rest.map((m) => (
                    <option key={m.id} value={m.id}>
                      {modelLabel(m, list.available)}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value={CUSTOM}>Other model id…</option>
            </select>
            {custom && (
              <input
                aria-label="Model id"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Exact model id, as the provider names it"
                style={{ ...inputStyle, marginTop: '6px' }}
                required
              />
            )}
          </>
        ) : (
          <input
            id="llm-model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={listing ? 'Loading models…' : 'Model id'}
            style={inputStyle}
            required
          />
        )}
      </div>

      {provider !== 'ollama' && (
        <div>
          <label htmlFor="llm-effort" style={labelStyle}>
            Reasoning effort
          </label>
          <select
            id="llm-effort"
            value={effort}
            onChange={(e) => setEffort(e.target.value as ReasoningEffort)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {REASONING_EFFORTS.map((value) => (
              <option key={value} value={value}>
                {EFFORT_LABELS[value]}
              </option>
            ))}
          </select>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              marginTop: '4px',
            }}
          >
            {selected && !selected.reasoning
              ? 'This model does not reason, so the setting has no effect on it.'
              : 'How long a reasoning model thinks before answering. Tailoring and imports are structured work; low is usually enough.'}
          </p>
        </div>
      )}

      {provider !== 'ollama' && (
        <div>
          <label htmlFor="llm-api-key" style={labelStyle}>
            API Key
          </label>
          <input
            id="llm-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={() => apiKey && loadModels(provider, apiKey)}
            placeholder={config?.hasApiKey ? 'API key saved ••••••' : 'sk-...'}
            style={inputStyle}
          />
          {config?.hasApiKey && !apiKey && (
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
                marginTop: '4px',
              }}
            >
              Leave blank to keep the existing key.
            </p>
          )}
        </div>
      )}

      {provider === 'ollama' && (
        <div>
          <label htmlFor="llm-ollama-url" style={labelStyle}>
            Ollama URL
          </label>
          <input
            id="llm-ollama-url"
            type="text"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
            style={inputStyle}
          />
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              marginTop: '4px',
            }}
          >
            Healthcheck: GET {ollamaUrl}/api/tags should return 200.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button
          type="submit"
          disabled={status === 'saving'}
          style={{
            background: 'var(--color-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-primary-fg)',
            fontSize: 'var(--text-sm)',
            padding: '8px 20px',
            cursor: status === 'saving' ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-sans)',
            opacity: status === 'saving' ? 0.7 : 1,
          }}
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {status === 'saved' && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            Saved
          </span>
        )}
        {status === 'error' && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>
            {errorMsg}
          </span>
        )}
      </div>
    </form>
  );
}
