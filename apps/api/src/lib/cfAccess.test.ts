import { describe, expect, it } from 'vitest';
import { cfAccessHeadersFor } from './cfAccess';

const env = {
  CF_ACCESS_CLIENT_ID: 'id',
  CF_ACCESS_CLIENT_SECRET: 'secret',
  CF_ACCESS_HOST: 'ollama.example.com',
};

const token = { 'CF-Access-Client-Id': 'id', 'CF-Access-Client-Secret': 'secret' };

describe('cfAccessHeadersFor', () => {
  it("sends the token to the owner's host", () => {
    expect(cfAccessHeadersFor(env, 'https://ollama.example.com')).toEqual(token);
    expect(cfAccessHeadersFor(env, 'https://OLLAMA.example.com:443/')).toEqual(token);
  });

  it('never sends it to a URL someone else saved', () => {
    expect(cfAccessHeadersFor(env, 'https://attacker.dev')).toBeUndefined();
    expect(cfAccessHeadersFor(env, 'https://ollama.example.com.attacker.dev')).toBeUndefined();
    expect(cfAccessHeadersFor(env, 'https://evil-ollama.example.com')).toBeUndefined();
    expect(cfAccessHeadersFor(env, 'https://x.ollama.example.com')).toBeUndefined();
  });

  it('never sends it over plain http', () => {
    expect(cfAccessHeadersFor(env, 'http://ollama.example.com')).toBeUndefined();
  });

  it('sends nothing when no host is configured', () => {
    expect(
      cfAccessHeadersFor(
        { CF_ACCESS_CLIENT_ID: 'id', CF_ACCESS_CLIENT_SECRET: 'secret' },
        'https://ollama.example.com',
      ),
    ).toBeUndefined();
  });

  it('sends nothing without both halves of the token, or without a URL', () => {
    expect(
      cfAccessHeadersFor(
        { CF_ACCESS_CLIENT_ID: 'id', CF_ACCESS_HOST: 'ollama.example.com' },
        'https://ollama.example.com',
      ),
    ).toBeUndefined();
    expect(cfAccessHeadersFor(env, null)).toBeUndefined();
    expect(cfAccessHeadersFor(env, 'not a url')).toBeUndefined();
  });
});
