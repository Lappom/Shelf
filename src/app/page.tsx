import Link from "next/link";

export default function Home() {
  return (
    <div className="bg-background flex flex-1 items-center justify-center px-6 py-16">
      <main className="w-full max-w-3xl space-y-8">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">Shelf</h1>
          <p className="text-muted-foreground text-lg">
            Bibliothèque personnelle self-hosted, lecteur EPUB intégré.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="bg-primary text-primary-foreground inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-medium"
            href="/login"
          >
            Connexion
          </Link>
          <Link
            className="border-input bg-background inline-flex h-11 items-center justify-center rounded-full border px-6 text-sm font-medium"
            href="/register"
          >
            Créer un compte
          </Link>
        </div>
      </main>
    </div>
  );
}
