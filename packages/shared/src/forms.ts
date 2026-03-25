/**
 * Form & script entity types (align with MongoDB models).
 */

export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  [key: string]: unknown;
}

export interface FieldDef {
  id: string;
  name: string;
  label?: string;
  type: string;
  placeholder?: string;
  validation?: FieldValidation;
}

export interface PageDef {
  id: string;
  title?: string;
  fields: FieldDef[];
}

export interface FormScriptRef {
  scriptId: string;
  event: string;
  order: number;
}

/** Unique identifier for each step in the flow */
export type StepId = string;

interface BaseStep {
  id: StepId;
  position?: { x: number; y: number };
}

export interface PageStep extends BaseStep {
  type: "page";
  pageId: string;
  onSubmit?: StepId;
}

export interface ScriptStep extends BaseStep {
  type: "script";
  scriptId: string;
  event: string;
  /** Output names for dynamic branching (e.g., ["gmail", "outlook", "other"]) */
  outputs?: string[];
  /** Map output name → target step ID */
  outputTargets?: Record<string, StepId>;
}

export interface StartStep extends BaseStep {
  type: "start";
  next?: StepId;
}

export interface EndStep extends BaseStep {
  type: "end";
  outcome: "success" | "failure";
}

/** A single step in the form flow: show a form page, run a script, or control flow */
export type FlowStep = PageStep | ScriptStep | StartStep | EndStep;

/** Edge type for connections between flow steps */
export type FlowEdgeHandle = "next" | "onSubmit";

export interface FlowEdge {
  id: string;
  source: StepId;
  target: StepId;
  sourceHandle?: FlowEdgeHandle;
}

export interface Form {
  id: string;
  name: string;
  slug: string;
  pages: PageDef[];
  scripts: FormScriptRef[];
  /** Ordered sequence: Start → steps → End. If set, defines form flow and script triggers. */
  flow?: FlowStep[];
  currentVersionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Script {
  id: string;
  name: string;
  source: string;
  version: number;
  createdAt: Date;
  lastDeployedAt?: Date;
  deployMetadata?: Record<string, unknown>;
}

export type HookEvent = "onLoad" | "onValidate" | "onSubmit" | "onPageChange";

export interface Deployment {
  id: string;
  target: string;
  workerName: string;
  workerRoute: string;
  status: "queued" | "building" | "deploying" | "active" | "failed";
  deployedAt?: Date;
  sourceSha?: string;
}
