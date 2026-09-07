declare interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare interface D1Database {
  prepare(query: string): D1Statement;
}
declare interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
}
declare interface R2Bucket {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType: string }; onlyIf?: { etagDoesNotMatch: string } }): Promise<unknown>;
}

declare module "cloudflare:workers" {
  export const env: { DB: D1Database };
}
