declare interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare interface D1Database {
  prepare(query: string): D1Statement;
  batch<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]>;
}
declare interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta?: { changes?: number };
}
declare interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}
declare interface R2Bucket {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType: string }; onlyIf?: { etagDoesNotMatch: string } }): Promise<unknown>;
}

declare module "cloudflare:workers" {
  export const env: { DB: D1Database };
}
