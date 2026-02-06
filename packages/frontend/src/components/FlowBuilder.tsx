import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FlowStep, PageDef, ScriptStep } from "@orcratration/shared";

const HOOK_EVENTS = ["onLoad", "onValidate", "onSubmit", "onPageChange"] as const;

type ScriptOption = { _id: string; name: string };

function generateId(): string {
  return "step-" + Math.random().toString(36).slice(2, 9);
}

function StepNode({
  step,
  index,
  pageTitle,
  scriptName,
  onEventChange,
  onRemove,
}: {
  step: FlowStep;
  index: number;
  pageTitle?: string;
  scriptName?: string;
  onEventChange?: (event: string) => void;
  onRemove: () => void;
}) {
  const id = `flow-step-${index}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isPage = step.type === "page";

  return (
    <div ref={setNodeRef} style={style} className={`flow-step ${isPage ? "flow-step-form" : "flow-step-script"} ${isDragging ? "dragging" : ""}`}>
      <span className="flow-step-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        ⋮⋮
      </span>
      <div className="flow-step-content">
        {isPage ? (
          <>
            <span className="flow-step-label">FORM</span>
            <span className="flow-step-title">{pageTitle ?? "(unnamed page)"}</span>
          </>
        ) : (
          <>
            <span className="flow-step-label">SCRIPT</span>
            <span className="flow-step-title">{scriptName ?? (step as ScriptStep).scriptId}</span>
            <select
              className="flow-step-event"
              value={(step as ScriptStep).event}
              onChange={(e) => onEventChange?.(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              {HOOK_EVENTS.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      <button type="button" className="flow-step-remove" onClick={onRemove} aria-label="Remove step">
        ×
      </button>
    </div>
  );
}

function Arrow() {
  return <span className="flow-arrow" aria-hidden>→</span>;
}

export default function FlowBuilder({
  flow,
  onFlowChange,
  pages,
  availableScripts,
}: {
  flow: FlowStep[];
  onFlowChange: (flow: FlowStep[]) => void;
  pages: PageDef[];
  availableScripts: ScriptOption[];
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const stepIds = flow.map((_, i) => `flow-step-${i}`);

  function getPageTitle(pageId: string): string {
    return pages.find((p) => p.id === pageId)?.title ?? "(page)";
  }

  function getScriptName(scriptId: string): string {
    return availableScripts.find((s) => s._id === scriptId)?.name ?? scriptId;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = stepIds.indexOf(String(active.id));
    const to = stepIds.indexOf(String(over.id));
    if (from !== -1 && to !== -1) {
      onFlowChange(arrayMove(flow, from, to));
    }
  }

  function updateStep(index: number, step: FlowStep) {
    const next = [...flow];
    next[index] = step;
    onFlowChange(next);
  }

  function removeStep(index: number) {
    onFlowChange(flow.filter((_, i) => i !== index));
  }

  function addPageStep(pageId: string) {
    onFlowChange([...flow, { id: generateId(), type: "page", pageId }]);
  }

  function addScriptStep(scriptId: string, event: string) {
    onFlowChange([...flow, { id: generateId(), type: "script", scriptId, event }]);
  }

  return (
    <div className="flow-builder">
      <div className="flow-actions">
        {pages.length > 0 && (
          <div className="flow-add-group">
            <label htmlFor="flow-add-page">Add form page:</label>
            <select
              id="flow-add-page"
              className="flow-add-select"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) {
                  addPageStep(v);
                  e.target.value = "";
                }
              }}
            >
              <option value="">— Choose page —</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.id}
                </option>
              ))}
            </select>
          </div>
        )}
        {availableScripts.length > 0 && (
          <div className="flow-add-group">
            <label htmlFor="flow-add-script">Add script:</label>
            <select
              id="flow-add-script"
              className="flow-add-select"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) {
                  addScriptStep(v, "onLoad");
                  e.target.value = "";
                }
              }}
            >
              <option value="">— Choose script —</option>
              {availableScripts.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flow-diagram">
        <div className="flow-node flow-start">START</div>
        <Arrow />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={stepIds} strategy={horizontalListSortingStrategy}>
            <div className="flow-steps">
              {flow.length === 0 ? (
                <div className="flow-empty">Add form pages and scripts above to build the flow</div>
              ) : (
                flow.map((step, index) => (
                  <span key={`${step.type}-${index}-${step.type === "page" ? step.pageId : (step as ScriptStep).scriptId}`} className="flow-step-wrap">
                    <StepNode
                      step={step}
                      index={index}
                      pageTitle={step.type === "page" ? getPageTitle(step.pageId) : undefined}
                      scriptName={step.type === "script" ? getScriptName(step.scriptId) : undefined}
                      onEventChange={step.type === "script" ? (event) => updateStep(index, { ...step, event }) : undefined}
                      onRemove={() => removeStep(index)}
                    />
                    {index < flow.length - 1 && <Arrow />}
                  </span>
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>

        {flow.length > 0 && (
          <>
            <Arrow />
            <div className="flow-node flow-end">END</div>
          </>
        )}
      </div>
    </div>
  );
}
