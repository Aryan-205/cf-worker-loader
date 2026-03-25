"use client";

import { useCallback, useRef } from "react";
import type { PageDef } from "@orcratration/shared";

interface FormPageProps {
    page: PageDef;
    pageId: string;
    savedData?: Record<string, unknown>;
    isLastPage: boolean;
    isSubmitting: boolean;
    onSubmit: (pageId: string, data: Record<string, unknown>) => void;
}

export function FormPage({
    page,
    pageId,
    savedData,
    isLastPage,
    isSubmitting,
    onSubmit,
}: FormPageProps) {
    const formRef = useRef<HTMLFormElement>(null);

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (!formRef.current) return;

            const fd = new FormData(formRef.current);
            const data: Record<string, unknown> = {};

            for (const field of page.fields) {
                if (field.type === "checkbox") {
                    data[field.name] = fd.has(field.name);
                } else {
                    data[field.name] = fd.get(field.name) ?? "";
                }
            }

            onSubmit(pageId, data);
        },
        [page.fields, pageId, onSubmit]
    );

    function getInputType(fieldType: string): string {
        switch (fieldType) {
            case "email":
                return "email";
            case "number":
                return "number";
            case "tel":
                return "tel";
            case "url":
                return "url";
            case "date":
                return "date";
            case "password":
                return "password";
            default:
                return "text";
        }
    }

    return (
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6">
            {page.title && (
                <h2 className="text-xl font-semibold" style={{ color: "var(--accent-light)" }}>
                    {page.title}
                </h2>
            )}

            {page.fields.map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                    <label
                        htmlFor={`field-${field.id}`}
                        className="text-sm font-medium"
                        style={{ color: "var(--foreground)" }}
                    >
                        {field.label ?? field.name}
                        {field.validation?.required && (
                            <span className="ml-1" style={{ color: "var(--error)" }}>
                                *
                            </span>
                        )}
                    </label>

                    {field.type === "textarea" ? (
                        <textarea
                            id={`field-${field.id}`}
                            name={field.name}
                            placeholder={field.placeholder}
                            required={Boolean(field.validation?.required)}
                            defaultValue={(savedData?.[field.name] as string) ?? ""}
                            rows={4}
                            className="form-input resize-y"
                        />
                    ) : field.type === "checkbox" ? (
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                                id={`field-${field.id}`}
                                type="checkbox"
                                name={field.name}
                                defaultChecked={(savedData?.[field.name] as boolean) ?? false}
                                className="form-checkbox"
                            />
                            <span className="text-sm" style={{ color: "var(--muted)" }}>
                                {field.placeholder ?? ""}
                            </span>
                        </label>
                    ) : (
                        <input
                            id={`field-${field.id}`}
                            type={getInputType(field.type)}
                            name={field.name}
                            placeholder={field.placeholder}
                            required={Boolean(field.validation?.required)}
                            defaultValue={(savedData?.[field.name] as string) ?? ""}
                            className="form-input"
                        />
                    )}
                </div>
            ))}

            <div className="flex justify-end pt-2">
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? (
                        <>
                            <span
                                className="inline-block h-4 w-4 rounded-full border-2 border-t-transparent animate-spin-slow"
                                style={{ borderColor: "white", borderTopColor: "transparent" }}
                            />
                            Submitting…
                        </>
                    ) : isLastPage ? (
                        "Submit"
                    ) : (
                        <>
                            Next
                            <span className="text-lg">→</span>
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}
