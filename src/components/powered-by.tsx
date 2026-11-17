import Link from "next/link";
import { config } from "@/lib/config";

/** Leyenda de la plataforma en páginas públicas (se oculta con marca blanca). */
export function PoweredBy({ hidden }: { hidden?: boolean }) {
  if (hidden) return null;
  return (
    <p className="mt-6 text-center text-xs text-stone-400">
      Con tecnología de{" "}
      <Link href="/" className="font-semibold text-stone-500 hover:underline">
        {config.appName}
      </Link>
    </p>
  );
}
