import "./env.js";
import { Hono } from "hono";
import { connectDb } from "./db.js";
import forms from "./routes/forms.js";
import scripts from "./routes/scripts.js";
import auth from "./routes/auth.js";
import { deployFormAndPersist, type DeployFormResponse } from "./lib/deploy.js";

function getDeployEnv() {
  return {
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    KV_NAMESPACE_ID: process.env.KV_NAMESPACE_ID,
  };
}

type DeployFn = (opts: Parameters<typeof deployFormAndPersist>[0]) => Promise<DeployFormResponse>;
type AppVariables = { deploy: DeployFn };

const app = new Hono<{ Variables: AppVariables }>();

app.use("/api/forms/*", async (c, next) => {
  c.set("deploy", async (opts) => deployFormAndPersist(opts, getDeployEnv()));
  await next();
});

app.route("/api/auth", auth);
app.route("/api/forms", forms);
app.route("/api/scripts", scripts);

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/deployments", async (c) => {
  const Deployment = (await import("./models/deployment.js")).default;
  const list = await Deployment.find().sort({ createdAt: -1 }).limit(100).lean();
  return c.json(list);
});

app.get("/api/forms/:slug/session/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const env = {
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? "",
    KV_NAMESPACE_ID: process.env.KV_NAMESPACE_ID ?? "",
  };
  const store = await import("./lib/kv.js").then((m) => m.getSessionStore(sessionId, env));
  return c.json({ sessionId, store });
});

app.post("/api/submit", async (c) => {
  const body = (await c.req.json()) as {
    session_id: string;
    formId: string;
    pageId?: string;
    event?: string;
    formData: Record<string, Record<string, unknown>>;
    forms?: unknown[];
  };
  const { session_id, formId, event = "onSubmit", formData } = body;
  if (!session_id || !formId) {
    return c.json({ error: "session_id and formId required" }, 400);
  }
  const Form = (await import("./models/form.js")).default;
  const Script = (await import("./models/script.js")).default;
  const Deployment = (await import("./models/deployment.js")).default;
  const form = await Form.findById(formId).lean();
  if (!form) return c.json({ error: "form not found" }, 404);
  const formDoc = form as unknown as { _id: unknown; name: string; pages: unknown[] };
  const formsMeta = [{ id: String(formDoc._id), name: formDoc.name, pages: formDoc.pages ?? [] }];
  const scripts = (form as unknown as { scripts: { scriptId: unknown; event: string }[] }).scripts ?? [];
  const forEvent = scripts.filter((s) => s.event === event);
  const scriptIds = forEvent.map((s) => String(s.scriptId));
  const payload = { session_id, formId, event, formData, forms: formsMeta };

  const loaderUrl = process.env.LOADER_URL ?? process.env.WORKER_LOADER_URL;

  if (loaderUrl) {
    const scriptDocs = await Script.find({ _id: { $in: scriptIds } }).lean();
    let lastResponse: unknown = { ok: true };
    for (const ref of forEvent) {
      const scriptId = String(ref.scriptId);
      const doc = scriptDocs.find((s) => String((s as { _id: unknown })._id) === scriptId) as { source: string } | undefined;
      if (!doc?.source) continue;
      try {
        const res = await fetch(loaderUrl.replace(/\/$/, "") + "/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scriptId,
            scriptSource: doc.source,
            ...payload,
          }),
        });
        lastResponse = await res.json();
        if (!res.ok) {
          return c.json(lastResponse, (res.status as 400) || 400);
        }
      } catch (err) {
        return c.json(
          { error: "worker_error", message: err instanceof Error ? err.message : String(err) },
          502
        );
      }
    }
    return c.json(lastResponse);
  }

  const deployments = await Deployment.find({
    scriptId: { $in: scriptIds },
    status: "active",
  })
    .sort({ deployedAt: -1 })
    .lean();
  const byScript = new Map<string, { workerUrl: string }>();
  for (const d of deployments) {
    const doc = d as unknown as { scriptId: unknown; workerUrl?: string };
    const sid = String(doc.scriptId);
    if (!byScript.has(sid) && doc.workerUrl) {
      byScript.set(sid, { workerUrl: doc.workerUrl });
    }
  }

  // If deployed workers exist, call them
  if (byScript.size > 0) {
    let lastResponse: unknown = { ok: true };
    for (const [, { workerUrl }] of byScript) {
      try {
        const res = await fetch(workerUrl + "/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        lastResponse = await res.json();
        if (!res.ok) {
          return c.json(lastResponse, (res.status as 400) || 400);
        }
      } catch (err) {
        return c.json(
          { error: "worker_error", message: err instanceof Error ? err.message : String(err) },
          502
        );
      }
    }
    return c.json(lastResponse);
  }

  // Fallback: execute scripts locally (dev mode)
  const scriptDocs = await Script.find({ _id: { $in: scriptIds } }).lean();
  const { executeScriptLocally } = await import("./lib/local-executor.js");

  let lastResult: unknown = { ok: true };
  for (const ref of forEvent) {
    const scriptId = String(ref.scriptId);
    const doc = scriptDocs.find((s) => String((s as { _id: unknown })._id) === scriptId) as { source: string } | undefined;
    if (!doc?.source) continue;
    try {
      const ctx = {
        session_id,
        formId,
        formData,
        forms: formsMeta as import("@orcratration/shared").FormsMeta,
        store: { get: async () => null },
      };
      const result = await executeScriptLocally(doc.source, ctx);
      if (!result.ok && result.error) {
        return c.json(
          { error: result.error.errorKey, message: result.error.message },
          result.error.status as 400
        );
      }
      if (result.response) {
        lastResult = result.response.payload;
      } else {
        lastResult = { ok: true, outputNode: result.outputNode, fieldErrors: result.fieldErrors };
      }
    } catch (err) {
      return c.json(
        { error: "script_runtime_error", message: err instanceof Error ? err.message : String(err) },
        500
      );
    }
  }
  return c.json(lastResult);
});

const port = Number(process.env.PORT) || 3000;

const { serve } = await import("@hono/node-server");

connectDb()
  .then(() => {
    console.log("MongoDB connected");
    serve({ fetch: app.fetch, port }, (info) => {
      console.log(`Backend listening on http://localhost:${info.port}`);
    });
  })
  .catch((err) => {
    console.error("Startup error:", err);
    process.exit(1);
  });
