/**
 * Script runtime types — consistent API for user scripts (ctx and hook).
 * Used by Worker runtime, editor (Monaco), and backend validation.
 */

export type FormValues = Record<string, unknown>;
export type FormsMeta = Array<{ id: string; name: string; pages: unknown[] }>;

export interface ReadonlyStore {
  get: (key: string) => Promise<unknown>;
  list?: (prefix?: string) => Promise<Record<string, unknown>>;
}

export interface Ctx {
  session_id: string;
  formId: string;
  pageId?: string;
  formData: Record<string, FormValues>;
  forms: FormsMeta;
  store: ReadonlyStore;
  env?: Record<string, unknown>;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Hook {
  setStoreData: (key: string, value: unknown) => Promise<void>;
  getStoreData: (key: string) => Promise<unknown>;
  setError: (statusCode: number, errorKey: string, message?: string) => void;
  setFieldError: (formId: string, fieldKey: string, message: string) => void;
  setRedirect: (url: string, status?: number) => void;
  setResponse: (payload: unknown, status?: number) => void;
  /** Route to a custom output node by name */
  setOutputNode: (name: string) => void;
  log: (level: LogLevel, msg: string, meta?: unknown) => void;
}

/** User script must export execute with this signature. */
export interface ScriptExecute {
  execute: (ctx: Ctx, hook: Hook) => Promise<void>;
}
