export default function FillIndexPage() {
    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <div className="glass-card p-8 sm:p-12 text-center max-w-md animate-fade-in">
                <div
                    className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ background: "var(--accent-glow)" }}
                >
                    <span className="text-3xl">📋</span>
                </div>
                <h1 className="text-2xl font-bold mb-3">Orcratration Forms</h1>
                <p className="text-muted text-base">
                    Navigate to a specific form using its URL to get started.
                </p>
            </div>
        </main>
    );
}
