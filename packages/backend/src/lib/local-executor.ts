/**
 * Local in-process script executor for dev/testing.
 * Evaluates script source directly in Node.js — no deployment required.
 *
 * In production, use the Cloudflare Worker Loader or per-script deployments.
 */

import type { Ctx, Hook } from "@orcratration/shared";

export interface LocalExecResult {
    ok: boolean;
    outputNode?: string;
    fieldErrors?: Array<{ formId: string; field: string; message: string }>;
    error?: { status: number; errorKey: string; message?: string };
    response?: { payload: unknown; status: number };
    redirect?: { url: string; status: number };
}

/**
 * Execute a user script source string locally.
 * The source must `export async function execute(ctx, hook)`.
 */
export async function executeScriptLocally(
    source: string,
    ctx: Ctx
): Promise<LocalExecResult> {
    const hookState: {
        outputNode?: string;
        fieldErrors: Array<{ formId: string; field: string; message: string }>;
        error?: { status: number; errorKey: string; message?: string };
        response?: { payload: unknown; status: number };
        redirect?: { url: string; status: number };
    } = { fieldErrors: [] };

    // In-memory session store for local dev
    const sessionStore = new Map<string, unknown>();

    const hook: Hook = {
        setStoreData: async (key, value) => {
            sessionStore.set(key, value);
        },
        getStoreData: async (key) => {
            return sessionStore.get(key) ?? null;
        },
        setError: (status, errorKey, message) => {
            hookState.error = { status, errorKey, message };
        },
        setFieldError: (formId, field, message) => {
            hookState.fieldErrors.push({ formId, field, message });
        },
        setRedirect: (url, status = 302) => {
            hookState.redirect = { url, status };
        },
        setResponse: (payload, status = 200) => {
            hookState.response = { payload, status };
        },
        setOutputNode: (name) => {
            hookState.outputNode = name;
        },
        log: (level, msg, meta) => {
            const tag = `[script:${level}]`;
            if (meta !== undefined) console[level === "debug" ? "debug" : level](tag, msg, meta);
            else console[level === "debug" ? "debug" : level](tag, msg);
        },
    };

    // Dynamically evaluate the script source
    // Convert ESM-style `export async function execute` to something we can call
    const wrappedSource = source
        .replace(/export\s+async\s+function\s+execute/, "async function execute")
        .replace(/export\s+\{[^}]*\}/, "");

    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    const fn = new AsyncFunction(
        "ctx",
        "hook",
        `${wrappedSource}\n;await execute(ctx, hook);`
    );

    await fn(ctx, hook);

    if (hookState.error) {
        return { ok: false, error: hookState.error, fieldErrors: hookState.fieldErrors };
    }
    if (hookState.response) {
        return { ok: true, response: hookState.response, outputNode: hookState.outputNode };
    }
    if (hookState.redirect) {
        return { ok: true, redirect: hookState.redirect };
    }
    return { ok: true, outputNode: hookState.outputNode, fieldErrors: hookState.fieldErrors };
}
