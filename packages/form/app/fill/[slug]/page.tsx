import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { FlowStep, PageDef } from "@orcratration/shared";
import { FormFlowEngine } from "./FormFlowEngine";

type FormBySlug = {
    _id: string;
    name: string;
    slug: string;
    pages: PageDef[];
    flow?: FlowStep[];
};

async function getFormBySlug(slug: string): Promise<FormBySlug | null> {
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3000";
    try {
        const res = await fetch(`${backendUrl}/api/forms/by-slug/${encodeURIComponent(slug)}`, {
            cache: "no-store",
        });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
    const { slug } = await params;
    const form = await getFormBySlug(slug);
    return {
        title: form ? `${form.name} — Orcratration Forms` : "Form Not Found",
        description: form ? `Fill out ${form.name}` : "The requested form was not found.",
    };
}

export default async function FillFormPage({ params }: { params: Params }) {
    const { slug } = await params;
    const form = await getFormBySlug(slug);

    if (!form) {
        notFound();
    }

    return (
        <main className="flex min-h-screen items-start justify-center px-4 py-12 sm:py-20">
            <div className="w-full max-w-xl">
                <FormFlowEngine form={form} />
            </div>
        </main>
    );
}
