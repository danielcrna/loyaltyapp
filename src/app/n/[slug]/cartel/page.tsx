import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { rulesSummary, stampRules } from "@/lib/loyalty";
import { publicUrl } from "@/lib/config";
import { QR } from "@/components/qr";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Cartel para imprimir" };

export default async function PosterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await db.business.findUnique({ where: { slug } });
  if (!b) notFound();
  const url = publicUrl(`/n/${b.slug}`);
  const pitch =
    b.programType === "STAMPS"
      ? stampRules(b).length > 1
        ? rulesSummary(stampRules(b))
        : `Junta ${b.stampsRequired} sellos y llévate ${b.stampReward.toLowerCase()}`
      : b.programType === "POINTS"
        ? "Gana puntos en cada compra"
        : `Recibe ${b.cashbackPercent}% de regreso en tu monedero`;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white p-8 print:p-0">
      <div className="w-full max-w-[560px] rounded-3xl p-10 text-center print:rounded-none" style={{ background: b.bgColor, color: b.fgColor }}>
        {b.logoId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${b.logoId}`} alt={b.name} className="mx-auto mb-4 h-20 object-contain" />
        ) : (
          <div className="mb-4 text-4xl font-black">{b.name}</div>
        )}
        <div className="text-3xl font-black">{b.programName}</div>
        <div className="mt-2 text-xl opacity-90">{pitch}</div>
        <div className="mx-auto my-8 w-fit rounded-3xl bg-white p-5">
          <QR value={url} size={280} />
        </div>
        <div className="text-2xl font-bold" style={{ color: b.labelColor }}>
          Escanea y obtén tu tarjeta
        </div>
        <div className="mt-2 text-sm opacity-80">Guárdala en Apple Wallet o Google Wallet · Sin descargar apps</div>
      </div>
      <PrintButton />
    </div>
  );
}
