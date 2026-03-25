import Link from "next/link";

export default function NotFound() {
    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <div className="glass-card p-8 sm:p-12 text-center max-w-md animate-fade-in">
                <div
                    className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
                    style={{ background: "var(--error-glow)" }}
                >
                    <span className="text-4xl">404</span>
                </div>
                <h1 className="text-2xl font-bold mb-3">Form Not Found</h1>
                <p className="text-muted text-base mb-6">
                    The form you&apos;re looking for doesn&apos;t exist or has been removed.
                </p>
                <Link href="/" className="btn-primary inline-block">
                    Go Home
                </Link>
            </div>
        </main>
    );
}
