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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FieldDef, FlowStep, FormScriptRef, PageDef } from "@orcratration/shared";
import { useEffect, useState } from "react";
import {
  INPUT_TYPES,
  newField,
  newPage,
  isRequired,
  setRequired,
  type InputType,
} from "../lib/formBuilder";
import DynamicFlowBuilder from "./DynamicFlowBuilder";

type FormDoc = {
  _id: string;
  name: string;
  slug: string;
  pages: PageDef[];
  scripts: FormScriptRef[];
};

type ScriptOption = { _id: string; name: string };

function SortableFieldRow({
  field,
  //@ts-ignore - pageId is not used
  pageId,
  onUpdate,
  onRemove,
}: {
  field: FieldDef;
  pageId: string;
  onUpdate: (f: FieldDef) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`form-builder-field ${isDragging ? "dragging" : ""}`}
    >
      <span className="form-builder-field-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        ⋮⋮
      </span>
      <input
        type="text"
        className="form-builder-field-name"
        value={field.name}
        onChange={(e) => onUpdate({ ...field, name: e.target.value.replace(/\s/g, "_") })}
        placeholder="Field name"
      />
      <select
        className="form-builder-field-type"
        value={field.type}
        onChange={(e) => onUpdate({ ...field, type: e.target.value as InputType })}
      >
        {INPUT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <label className="form-builder-field-required">
        <input
          type="checkbox"
          checked={isRequired(field)}
          onChange={(e) => onUpdate(setRequired(field, e.target.checked))}
        />
        Required
      </label>
      <button type="button" className="form-builder-field-remove" onClick={onRemove} aria-label="Remove field">
        Remove
      </button>
    </div>
  );
}

function SortablePageCard({
  page,
  pageIndex,
  onUpdatePage,
  onAddField,
  onUpdateField,
  onRemoveField,
  onRemovePage,
}: {
  page: PageDef;
  pageIndex: number;
  onUpdatePage: (p: PageDef) => void;
  onAddField: () => void;
  onUpdateField: (f: FieldDef) => void;
  onRemoveField: (fieldId: string) => void;
  onRemovePage: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const fieldIds = page.fields.map((f) => f.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`form-builder-page ${isDragging ? "dragging" : ""}`}
    >
      <div className="form-builder-page-header">
        <span className="form-builder-page-handle" {...attributes} {...listeners} aria-label="Drag to reorder page">
          ⋮⋮
        </span>
        <span className="form-builder-page-number">Page {pageIndex + 1}</span>
        <input
          type="text"
          className="form-builder-page-title"
          value={page.title ?? ""}
          onChange={(e) => onUpdatePage({ ...page, title: e.target.value })}
          placeholder="Page title"
        />
        <button type="button" className="form-builder-page-remove" onClick={onRemovePage} aria-label="Remove page">
          Remove page
        </button>
      </div>
      <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
        <div className="form-builder-fields">
          {page.fields.map((field) => (
            <SortableFieldRow
              key={field.id}
              field={field}
              pageId={page.id}
              onUpdate={onUpdateField}
              onRemove={() => onRemoveField(field.id)}
            />
          ))}
        </div>
      </SortableContext>
      <button type="button" className="form-builder-add-field" onClick={onAddField}>
        + Add field
      </button>
    </div>
  );
}

export default function FormBuilder({
  form,
  onSave,
  saving,
  flow,
  onFlowChange,
  availableScripts,
}: {
  form: FormDoc;
  onSave: (payload: { name: string; slug: string; pages: PageDef[] }) => Promise<void>;
  saving: boolean;
  flow: FlowStep[];
  onFlowChange: (flow: FlowStep[]) => void;
  availableScripts: ScriptOption[];
}) {
  const [pages, setPages] = useState<PageDef[]>(form.pages ?? []);
  useEffect(() => {
    setPages(form.pages ?? []);
  }, [form._id]);
  const pageIds = pages.map((p) => p.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const overId = String(over.id);
    const activeId = String(active.id);

    if (pageIds.includes(activeId)) {
      const from = pages.findIndex((p) => p.id === activeId);
      const to = pages.findIndex((p) => p.id === overId);
      if (from !== -1 && to !== -1) setPages(arrayMove(pages, from, to));
      return;
    }

    for (let i = 0; i < pages.length; i++) {
      const fieldIds = pages[i].fields.map((f) => f.id);
      if (fieldIds.includes(activeId) && fieldIds.includes(overId)) {
        const newFields = arrayMove(
          pages[i].fields,
          pages[i].fields.findIndex((f) => f.id === activeId),
          pages[i].fields.findIndex((f) => f.id === overId)
        );
        setPages((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], fields: newFields };
          return next;
        });
        return;
      }
    }
  }

  function addPage() {
    setPages((prev) => [...prev, newPage()]);
  }

  function updatePage(index: number, page: PageDef) {
    setPages((prev) => {
      const next = [...prev];
      next[index] = page;
      return next;
    });
  }

  function removePage(index: number) {
    setPages((prev) => prev.filter((_, i) => i !== index));
  }

  function addField(pageIndex: number) {
    setPages((prev) => {
      const next = [...prev];
      next[pageIndex] = {
        ...next[pageIndex],
        fields: [...next[pageIndex].fields, newField()],
      };
      return next;
    });
  }

  function updateField(pageIndex: number, field: FieldDef) {
    setPages((prev) => {
      const next = [...prev];
      const page = next[pageIndex];
      next[pageIndex] = {
        ...page,
        fields: page.fields.map((f) => (f.id === field.id ? field : f)),
      };
      return next;
    });
  }

  function removeField(pageIndex: number, fieldId: string) {
    setPages((prev) => {
      const next = [...prev];
      next[pageIndex] = {
        ...next[pageIndex],
        fields: next[pageIndex].fields.filter((f) => f.id !== fieldId),
      };
      return next;
    });
  }

  async function handleSave() {
    await onSave({ name: form.name, slug: form.slug, pages });
  }

  return (
    <div className="form-builder">
      <div className="form-builder-toolbar">
        <button type="button" className="btn-primary" onClick={addPage}>
          + Add page
        </button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save form"}
        </button>
      </div>

      <div className="form-builder-flow">
        <h3 className="form-builder-subheading">Flow</h3>
        <p className="form-builder-hint-inline">
          Build your flow visually: drag nodes, connect handles. Scripts branch on Success (✓) or Error (✗).
        </p>
        <DynamicFlowBuilder
          flow={flow}
          onFlowChange={onFlowChange}
          pages={pages}
          availableScripts={availableScripts}
        />
      </div>

      <h3 className="form-builder-subheading">Pages & fields</h3>
      <p className="form-builder-hint-inline">
        Add pages and fields. Drag the ⋮⋮ handle to reorder. Set field name, input type, and required.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
          <div className="form-builder-pages">
            {pages.length === 0 ? (
              <p className="form-builder-empty">No pages yet. Add a page to start building your form flow.</p>
            ) : (
              pages.map((page, index) => (
                <SortablePageCard
                  key={page.id}
                  page={page}
                  pageIndex={index}
                  onUpdatePage={(p) => updatePage(index, p)}
                  onAddField={() => addField(index)}
                  onUpdateField={(f) => updateField(index, f)}
                  onRemoveField={(fieldId) => removeField(index, fieldId)}
                  onRemovePage={() => removePage(index)}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
