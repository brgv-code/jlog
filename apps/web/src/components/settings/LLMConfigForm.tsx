import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

type Provider = 'anthropic' | 'openai' | 'gemini' | 'ollama';

interface LLMConfig {
  provider: Provider;
  model: string;
  ollamaUrl: string | null;
  hasApiKey: boolean;
}

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-3-5-haiku-20241022',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
  ollama: 'llama3',
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
  const [model, setModel] = useState(DEFAULT_MODELS.anthropic);
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
          setModel(names[0] ?? DEFAULT_MODELS.ollama);
        }
      })
      .catch(() => setOllamaModels([]));
  }, [provider, ollamaUrl, model]);

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(DEFAULT_MODELS[p]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setErrorMsg('');

    try {
      const body: Record<string, string> = { provider, model };
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
        ) : (
          <input
            id="llm-model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={inputStyle}
            required
          />
        )}
      </div>

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
            background: 'var(--color-accent)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: '#fff',
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
