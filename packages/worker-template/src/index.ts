/**
 * Worker runtime wrapper (bundled & deployed for each script).
 * The user's script is bundled and inserted by deployer (export execute).
 * Wrapper receives JSON POST: { session_id, formId, event, formData, env }.
 */

import { Hono } from "hono";
import type { Ctx, Hook, ScriptExecute } from "@orcratration/shared";

type Env = {
  KV?: KVNamespace;
  [key: string]: unknown;
};

interface SessionStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(prefix: string): Promise<{ name: string }[]>;
}

function sessionStore(prefix: string, env: Env): SessionStore {
  const KV = env.KV;
  if (KV) {
    return {
      get: (k) => KV.get(prefix + k),
      put: (k, v) => KV.put(prefix + k, v),
      list: (p) => KV.list({ prefix: prefix + p }).then((r) => r.keys.map((k) => ({ name: k.name }))),
    };
  }
  const memory = new Map<string, string>();
  return {
    get: async (k) => memory.get(prefix + k) ?? null,
    put: async (k, v) => {
      memory.set(prefix + k, v);
    },
    list: async (p) =>
      [...memory.keys()].filter((name) => name.startsWith(prefix + p)).map((name) => ({ name })),
  };
}

function createRuntime(userModule: ScriptExecute) {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const payload = (await c.req.json()) as {
      session_id: string;
      formId: string;
      pageId?: string;
      event: string;
      formData: Record<string, Record<string, unknown>>;
      forms?: Ctx["forms"];
      env?: Record<string, unknown>;
    };

    const { session_id, formId, pageId, formData, forms = [], env = {} } = payload;

    const prefix = `ORCR_SESSION::${session_id}::`;
    const store = sessionStore(prefix, c.env as Env);

    const ctx: Ctx = {
      session_id,
      formId,
      pageId,
      formData,
      forms,
      store: {
        get: async (k) => {
          const raw = await store.get(k);
          return raw ? JSON.parse(raw) : null;
        },
        list: async (keyPrefix?: string) => {
          const keys = await store.list(keyPrefix ?? "");
          const out: Record<string, unknown> = {};
          for (const { name } of keys) {
            const short = name.slice(prefix.length);
            const v = await store.get(short);
            out[short] = v ? JSON.parse(v) : null;
          }
          return out;
        },
      },
      env: { ...c.env, ...env },
    };

    const hookState: {
      __error?: { status: number; errorKey: string; message?: string };
      __fieldErrors?: Array<{ formId: string; field: string; message: string }>;
      __redirect?: { url: string; status: number };
      __response?: { payload: unknown; status: number };
      __outputNode?: string;
    } = {};

    const hook: Hook = {
      setStoreData: async (key, value) => {
        await store.put(key, JSON.stringify(value));
      },
      getStoreData: async (key) => {
        const v = await store.get(key);
        return v ? JSON.parse(v) : null;
      },
      setError: (status, errorKey, message) => {
        hookState.__error = { status, errorKey, message };
      },
      setFieldError: (f, k, m) => {
        hookState.__fieldErrors = hookState.__fieldErrors ?? [];
        hookState.__fieldErrors.push({ formId: f, field: k, message: m });
      },
      setRedirect: (url, status = 302) => {
        hookState.__redirect = { url, status };
      },
      setResponse: (payload, status = 200) => {
        hookState.__response = { payload, status };
      },
      setOutputNode: (name) => {
        hookState.__outputNode = name;
      },
      log: (level, msg, meta) => {
        if (level === "debug") console.debug(msg, meta ?? "");
        else if (level === "info") console.info(msg, meta ?? "");
        else if (level === "warn") console.warn(msg, meta ?? "");
        else if (level === "error") console.error(msg, meta ?? "");
        else console.log(msg, meta ?? "");
      },
    };

    try {
      await userModule.execute(ctx, hook);

      if (hookState.__error) {
        return c.json(
          { error: hookState.__error.errorKey, message: hookState.__error.message },
          hookState.__error.status as 400
        );
      }
      if (hookState.__response) {
        return c.json(hookState.__response.payload, hookState.__response.status as 200);
      }
      if (hookState.__redirect) {
        return c.redirect(hookState.__redirect.url, hookState.__redirect.status as 302);
      }
      return c.json({ ok: true, fieldErrors: hookState.__fieldErrors ?? [], outputNode: hookState.__outputNode });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Script runtime error:", err);
      return c.json({ error: "script_runtime_error", message }, 500);
    }
  });

  return app;
}

// Default: no-op script for local dev (deployer replaces this with bundled user script)
const defaultModule: ScriptExecute = {
  execute: async (_ctx, hook) => {
    hook.log("info", "Orcratration worker — no script injected (dev mode)");
  },
};

const app = createRuntime(defaultModule);
export default app;
export { createRuntime };
