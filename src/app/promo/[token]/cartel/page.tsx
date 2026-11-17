import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { publicUrl } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { QR } from "@/components/qr";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Cartel de promoción", robots: { index: false } };

export default async function PromoPosterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const promo = await db.promotion.findUnique({ where: { claimToken: token }, include: { business: true } });
  if (!promo) notFound();
  const b = promo.business;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white p-8 print:p-0">
      <div className="w-full max-w-[560px] rounded-3xl p-10 text-center print:rounded-none" style={{ background: b.bgColor, color: b.fgColor }}>
        {b.logoId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${b.logoId}`} alt={b.name} className="mx-auto mb-4 h-16 object-contain" />
        ) : (
          <div className="mb-4 text-3xl font-black">{b.name}</div>
        )}
        {promo.discountLabel && (
          <div className="text-6xl font-black" style={{ color: b.labelColor }}>
            {promo.discountLabel}
          </div>
        )}
        <div className="mt-2 text-3xl font-black">{promo.title}</div>
        {promo.description && <div className="mt-2 text-lg opacity-90">{promo.description}</div>}
        <div className="mx-auto my-8 w-fit rounded-3xl bg-white p-5">
          <QR value={publicUrl(`/promo/${token}`)} size={260} />
        </div>
        <div className="text-2xl font-bold" style={{ color: b.labelColor }}>
          Escanea y agrégalo a tu tarjeta
        </div>
        <div className="mt-2 text-sm opacity-80">
          ¿Aún no tienes tarjeta? Escanea y obtenla gratis.
          {promo.endsAt && ` Válido hasta ${formatDate(promo.endsAt)}.`}
        </div>
      </div>
      <PrintButton />
    </div>
  );
}
