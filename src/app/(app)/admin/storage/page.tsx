import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Card } from "@/components/ui/card";

function formatBytes(n: bigint | number) {
  const v = typeof n === "bigint" ? Number(n) : n;
  if (!Number.isFinite(v) || v < 0) return "—";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let x = v;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x < 10 && i > 0 ? x.toFixed(1) : Math.round(x)} ${units[i]}`;
}

export default async function AdminStoragePage() {
  await requireAdmin();

  const [fileAgg, bookCount] = await Promise.all([
    prisma.bookFile.aggregate({
      _sum: { fileSize: true },
      _count: { id: true },
    }),
    prisma.book.count({ where: { deletedAt: null } }),
  ]);

  const totalBytes = fileAgg._sum.fileSize ?? BigInt(0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="eleven-display-section text-xl">Stockage</h2>
        <p className="text-eleven-muted text-sm">
          Statistiques agrégées des fichiers EPUB enregistrés (table{" "}
          <code className="text-xs">book_files</code>
          ).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="shadow-eleven-card p-4">
          <div className="text-eleven-muted text-xs font-medium uppercase">Volume total</div>
          <div className="eleven-display-section mt-1 text-2xl">{formatBytes(totalBytes)}</div>
          <div className="text-eleven-muted mt-2 text-sm">
            {fileAgg._count.id} fichier{fileAgg._count.id === 1 ? "" : "s"} en base
          </div>
        </Card>
        <Card className="shadow-eleven-card p-4">
          <div className="text-eleven-muted text-xs font-medium uppercase">Livres actifs</div>
          <div className="eleven-display-section mt-1 text-2xl">{bookCount}</div>
          <div className="text-eleven-muted mt-2 text-sm">
            Entrées <code className="text-xs">books</code> non supprimées
          </div>
        </Card>
      </div>
      <p className="text-eleven-muted text-xs">
        Les couvertures et métadonnées utilisent d’autres chemins storage ; l’espace disque réel
        dépend de l’adapter (local ou S3/MinIO).
      </p>
    </div>
  );
}
