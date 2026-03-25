"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
    FlowStep,
    PageDef,
    PageStep,
    ScriptStep,
    StartStep,
    EndStep,
    StepId,
} from "@orcratration/shared";
import { FormPage } from "./FormPage";

type FormBySlug = {
    _id: string;
    name: string;
    slug: string;
    pages: PageDef[];
    flow?: FlowStep[];
};

/* ─── helpers ─── */

function generateId(): string {
    return "step-" + Math.random().toString(36).slice(2, 9);
}

function generateSessionId(): string {
    return "sess-" + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now());
}

function findStepById(flow: FlowStep[], id: StepId | undefined): FlowStep | undefined {
    return id ? flow.find((s) => s.id === id) : undefined;
}

function findStartStep(flow: FlowStep[]): StartStep | undefined {
    return flow.find((s) => s.type === "start") as StartStep | undefined;
}

/** Build a flow from legacy format if no flow array is present */
function buildFlow(form: FormBySlug): FlowStep[] {
    if (form.flow?.length) return form.flow;

    const steps: FlowStep[] = [];
    const startId = generateId();
    let prevId: string | undefined = startId;

    steps.push({ id: startId, type: "start", next: undefined } as StartStep);

    for (const page of form.pages ?? []) {
        const pageStepId = generateId();
        if (prevId) {
            const prevStep = steps.find((s) => s.id === prevId);
            if (prevStep?.type === "start") (prevStep as StartStep).next = pageStepId;
            if (prevStep?.type === "page") (prevStep as PageStep).onSubmit = pageStepId;
        }
        steps.push({ id: pageStepId, type: "page", pageId: page.id } as PageStep);
        prevId = pageStepId;
    }

    const endId = generateId();
    if (prevId) {
        const prevStep = steps.find((s) => s.id === prevId);
        if (prevStep?.type === "start") (prevStep as StartStep).next = endId;
        if (prevStep?.type === "page") (prevStep as PageStep).onSubmit = endId;
    }
    steps.push({ id: endId, type: "end", outcome: "success" } as EndStep);

    return steps;
}

/* ─── component ─── */

export function FormFlowEngine({ form }: { form: FormBySlug }) {
    const [sessionId] = useState(generateSessionId);
    const flow = useMemo(() => buildFlow(form), [form]);
    const startStep = useMemo(() => findStartStep(flow), [flow]);

    const [currentStepId, setCurrentStepId] = useState<StepId | null>(
        startStep?.next ?? null
    );
    const [formData, setFormData] = useState<Record<string, Record<string, unknown>>>({});
    const [runningScript, setRunningScript] = useState(false);
    const [outcome, setOutcome] = useState<"success" | "failure" | null>(null);

    const currentStep = findStepById(flow, currentStepId ?? undefined);

    const currentPage =
        currentStep?.type === "page"
            ? form.pages?.find((p) => p.id === (currentStep as PageStep).pageId) ?? null
            : null;

    /* Count page steps for progress bar */
    const pageStepIds = useMemo(() => flow.filter((s) => s.type === "page").map((s) => s.id), [flow]);
    const currentPageIndex = currentStepId ? pageStepIds.indexOf(currentStepId) : -1;
    const progress =
        pageStepIds.length > 0 && currentPageIndex >= 0
            ? ((currentPageIndex + 1) / pageStepIds.length) * 100
            : 0;

    /* Run a script step */
    const runScriptStep = useCallback(
        async (step: ScriptStep): Promise<{ success: boolean; outputNode?: string }> => {
            setRunningScript(true);
            try {
                const res = await fetch("/api/submit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        session_id: sessionId,
                        formId: form._id,
                        event: step.event,
                        formData,
                        forms: [],
                    }),
                });
                const data = await res.json();
                if (!res.ok || data.error) return { success: false };
                return { success: true, outputNode: data.outputNode };
            } catch {
                return { success: false };
            } finally {
                setRunningScript(false);
            }
        },
        [form._id, sessionId, formData]
    );

    /* Auto-process script steps */
    useEffect(() => {
        if (!currentStep || currentStep.type !== "script") return;
        let cancelled = false;

        (async () => {
            const scriptStep = currentStep as ScriptStep;
            const result = await runScriptStep(scriptStep);
            if (cancelled) return;

            let nextId: string | undefined;
            if (result.outputNode && scriptStep.outputTargets) {
                nextId = scriptStep.outputTargets[result.outputNode];
            }

            if (nextId) {
                setCurrentStepId(nextId);
            } else {
                setOutcome(result.success ? "success" : "failure");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [currentStepId, currentStep?.type, runScriptStep, currentStep]);

    /* Handle end steps */
    useEffect(() => {
        if (currentStep?.type === "end") {
            setOutcome((currentStep as EndStep).outcome);
        }
    }, [currentStep]);

    /* Advance from a page */
    const advance = useCallback(
        (pageId: string, pageData: Record<string, unknown>) => {
            const newFormData = { ...formData, [pageId]: pageData };
            setFormData(newFormData);

            if (currentStep?.type !== "page") return;
            const nextId = (currentStep as PageStep).onSubmit;
            if (nextId) {
                setCurrentStepId(nextId);
            } else {
                setOutcome("success");
            }
        },
        [currentStep, formData]
    );

    /* Check if last page */
    const nextStep =
        currentStep?.type === "page"
            ? findStepById(flow, (currentStep as PageStep).onSubmit)
            : null;
    const isLastPage = !nextStep || nextStep.type === "end";

    /* ─── Render states ─── */

    // Outcome
    if (outcome) {
        const isSuccess = outcome === "success";
        return (
            <div className="glass-card p-8 sm:p-12 text-center animate-fade-in">
                <div
                    className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
                    style={{
                        background: isSuccess ? "var(--success-glow)" : "var(--error-glow)",
                    }}
                >
                    <span className="text-4xl">{isSuccess ? "✓" : "✗"}</span>
                </div>
                <h1 className="text-2xl font-bold mb-3">{form.name}</h1>
                <p className="text-muted text-lg mb-8">
                    {isSuccess
                        ? "Thank you! Your response has been submitted successfully."
                        : "Something went wrong with your submission. Please try again."}
                </p>
                <a
                    href={`/fill/${form.slug}`}
                    className="btn-primary inline-block"
                >
                    {isSuccess ? "Submit another response" : "Try again"}
                </a>
            </div>
        );
    }

    // Script processing
    if (currentStep?.type === "script") {
        return (
            <div className="glass-card p-8 sm:p-12 text-center animate-fade-in">
                <h1 className="text-2xl font-bold mb-6">{form.name}</h1>
                <div className="flex flex-col items-center gap-4">
                    <div
                        className="h-10 w-10 rounded-full border-2 border-t-transparent animate-spin-slow"
                        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
                    />
                    <p className="text-muted">
                        {runningScript ? "Processing your data…" : "Moving to next step…"}
                    </p>
                </div>
            </div>
        );
    }

    // No valid page
    if (!currentPage || currentStep?.type !== "page") {
        return (
            <div className="glass-card p-8 sm:p-12 text-center animate-fade-in">
                <h1 className="text-2xl font-bold mb-4">{form.name}</h1>
                <p className="text-muted">This form has no steps configured.</p>
            </div>
        );
    }

    // Form page
    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">{form.name}</h1>
                {pageStepIds.length > 1 && (
                    <div className="flex items-center gap-3">
                        <div className="progress-track flex-1">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs text-muted whitespace-nowrap">
                            {currentPageIndex + 1} / {pageStepIds.length}
                        </span>
                    </div>
                )}
            </div>

            {/* Page card */}
            <div className="glass-card p-6 sm:p-8 animate-slide-in" key={currentStepId}>
                <FormPage
                    page={currentPage}
                    pageId={(currentStep as PageStep).pageId}
                    savedData={formData[(currentStep as PageStep).pageId]}
                    isLastPage={isLastPage}
                    isSubmitting={runningScript}
                    onSubmit={advance}
                />
            </div>
        </div>
    );
}
