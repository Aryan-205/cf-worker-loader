import type { FlowStep, PageDef, PageStep, ScriptStep, StartStep, EndStep, StepId } from "@orcratration/shared";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API = "/api";

type FormBySlug = {
  _id: string;
  name: string;
  slug: string;
  pages: PageDef[];
  flow?: FlowStep[];
  scripts: { scriptId: string; event: string; order: number }[];
};

function generateId(): string {
  return "step-" + Math.random().toString(36).slice(2, 9);
}

/** Build a flow from legacy format if no flow array is present */
function buildFlow(form: FormBySlug): FlowStep[] {
  if (form.flow?.length) return form.flow;

  // Legacy conversion: create linear flow from pages + scripts
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
      if (prevStep?.type === "script" && (prevStep as ScriptStep).outputTargets) {
        // Legacy fallback: link first output to next step
        const outputs = (prevStep as ScriptStep).outputs ?? [];
        if (outputs.length > 0) {
          (prevStep as ScriptStep).outputTargets![outputs[0]] = pageStepId;
        }
      }
    }
    steps.push({ id: pageStepId, type: "page", pageId: page.id } as PageStep);
    prevId = pageStepId;
  }

  const endId = generateId();
  if (prevId) {
    const prevStep = steps.find((s) => s.id === prevId);
    if (prevStep?.type === "start") (prevStep as StartStep).next = endId;
    if (prevStep?.type === "page") (prevStep as PageStep).onSubmit = endId;
    if (prevStep?.type === "script" && (prevStep as ScriptStep).outputTargets) {
      const outputs = (prevStep as ScriptStep).outputs ?? [];
      if (outputs.length > 0) {
        (prevStep as ScriptStep).outputTargets![outputs[0]] = endId;
      }
    }
  }
  steps.push({ id: endId, type: "end", outcome: "success" } as EndStep);

  return steps;
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

export default function FormFill() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<FormBySlug | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(generateSessionId);
  const [currentStepId, setCurrentStepId] = useState<StepId | null>(null);
  const [formData, setFormData] = useState<Record<string, Record<string, unknown>>>({});
  const [runningScript, setRunningScript] = useState(false);
  const [outcome, setOutcome] = useState<"success" | "failure" | null>(null);

  // Load form
  useEffect(() => {
    if (!slug) return;
    fetch(API + "/forms/by-slug/" + encodeURIComponent(slug))
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Form not found" : "Failed to load form");
        return r.json();
      })
      .then((f: FormBySlug) => {
        setForm(f);
        const flow = buildFlow(f);
        const start = findStartStep(flow);
        setCurrentStepId(start?.next ?? null);
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  const flow = form ? buildFlow(form) : [];
  const currentStep = findStepById(flow, currentStepId ?? undefined);
  const currentPage =
    form && currentStep?.type === "page"
      ? form.pages?.find((p) => p.id === (currentStep as PageStep).pageId)
      : null;


  /** Run a script and return result with success status and optional outputNode */
  const runScriptStep = useCallback(
    async (
      step: ScriptStep,
      dataOverride?: Record<string, Record<string, unknown>>
    ): Promise<{ success: boolean; outputNode?: string }> => {
      if (!form) return { success: true };
      setRunningScript(true);
      try {
        const res = await fetch(API + "/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            formId: form._id,
            event: step.event,
            formData: dataOverride ?? formData,
            forms: [],
          }),
        });
        const data = await res.json();
        // Check if response indicates error
        if (!res.ok || data.error) {
          return { success: false };
        }
        return { success: true, outputNode: data.outputNode };
      } catch {
        return { success: false };
      } finally {
        setRunningScript(false);
      }
    },
    [form, sessionId, formData]
  );

  /** Process automatic script steps */
  useEffect(() => {
    if (!currentStep || currentStep.type !== "script" || !form) return;
    let cancelled = false;

    (async () => {
      const scriptStep = currentStep as ScriptStep;
      const result = await runScriptStep(scriptStep);
      if (cancelled) return;

      // Determine next step based on output node
      let nextId: string | undefined;

      if (result.outputNode && scriptStep.outputTargets) {
        nextId = scriptStep.outputTargets[result.outputNode];
      }

      if (nextId) {
        setCurrentStepId(nextId);
      } else {
        // No matching output target, end with appropriate outcome
        setOutcome(result.success ? "success" : "failure");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentStepId, currentStep?.type, form?._id, runScriptStep]);

  /** Handle end steps */
  useEffect(() => {
    if (currentStep?.type === "end") {
      setOutcome((currentStep as EndStep).outcome);
    }
  }, [currentStep]);

  /** Get page data from form fields */
  const getPageData = useCallback((page: PageDef): Record<string, unknown> => {
    const data: Record<string, unknown> = {};
    for (const f of page.fields) {
      const el = document.querySelector(
        `[name="${f.name}"]`
      ) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (el) {
        data[f.name] = el.type === "checkbox" ? (el as HTMLInputElement).checked : el.value;
      }
    }
    return data;
  }, []);

  /** Advance from a page step */
  const advance = useCallback(async () => {
    if (currentStep?.type !== "page" || !currentPage || !form) return;

    const pageStep = currentStep as PageStep;
    const pageData = getPageData(currentPage);
    const newFormData = { ...formData, [pageStep.pageId]: pageData };
    setFormData(newFormData);

    // Move to next step
    const nextId = pageStep.onSubmit;
    if (nextId) {
      setCurrentStepId(nextId);
    } else {
      // No next step, complete with success
      setOutcome("success");
    }
  }, [currentStep, currentPage, form, formData, getPageData]);

  /** Handle form submission (last page) */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await advance();
    },
    [advance]
  );

  // Error state
  if (error) {
    return (
      <div className="form-fill">
        <p className="error">{error}</p>
        <a href="/">Back to home</a>
      </div>
    );
  }

  // Loading state
  if (!form) {
    return <div className="form-fill"><p>Loading form…</p></div>;
  }

  // Complete state
  if (outcome) {
    return (
      <div className={`form-fill form-fill-complete ${outcome === "failure" ? "form-fill-failure" : ""}`}>
        <h1>{form.name}</h1>
        <p className="form-fill-done">
          {outcome === "success"
            ? "Thank you. Your response has been submitted."
            : "There was an issue with your submission."}
        </p>
        <a href="/">Back to home</a>
      </div>
    );
  }

  // Script running state
  if (currentStep?.type === "script") {
    return (
      <div className="form-fill">
        <h1>{form.name}</h1>
        <p className="form-fill-running">{runningScript ? "Processing…" : "Moving to next step…"}</p>
      </div>
    );
  }

  // No valid step
  if (!currentPage || currentStep?.type !== "page") {
    return (
      <div className="form-fill">
        <h1>{form.name}</h1>
        <p>No steps in this form.</p>
      </div>
    );
  }

  const pageStep = currentStep as PageStep;

  // Check if this is the last page (no onSubmit target or target is end node)
  const nextStep = findStepById(flow, pageStep.onSubmit);
  const isLastPage = !nextStep || nextStep.type === "end";

  return (
    <div className="form-fill">
      <h1>{form.name}</h1>
      {currentPage.title && <h2 className="form-fill-page-title">{currentPage.title}</h2>}
      <form onSubmit={handleSubmit} className="form-fill-fields">
        {currentPage.fields.map((field) => (
          <label key={field.id} className="form-fill-field">
            <span className="form-fill-label">{field.label ?? field.name}</span>
            {field.type === "textarea" ? (
              <textarea
                name={field.name}
                placeholder={field.placeholder}
                required={Boolean(field.validation?.required)}
                defaultValue={(formData[pageStep.pageId]?.[field.name] as string) ?? ""}
              />
            ) : field.type === "checkbox" ? (
              <input
                type="checkbox"
                name={field.name}
                defaultChecked={(formData[pageStep.pageId]?.[field.name] as boolean) ?? false}
              />
            ) : (
              <input
                type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
                name={field.name}
                placeholder={field.placeholder}
                required={Boolean(field.validation?.required)}
                defaultValue={(formData[pageStep.pageId]?.[field.name] as string) ?? ""}
              />
            )}
          </label>
        ))}
        <div className="form-fill-actions">
          {isLastPage ? (
            <button type="submit" className="btn-primary" disabled={runningScript}>
              {runningScript ? "Submitting…" : "Submit"}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={advance} disabled={runningScript}>
              Next
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
