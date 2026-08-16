// Minimal ambient declaration so this test-only file can read process.env
// without pulling @types/node into a package that otherwise targets Workers.
declare const process: { env: Record<string, string | undefined> };

export function envVar(name: string): string | undefined {
  return process.env[name];
}
