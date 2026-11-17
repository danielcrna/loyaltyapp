import Link from "next/link";
import { config } from "@/lib/config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-stone-100 px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 text-xl font-bold text-stone-900">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white">★</span>
        {config.appName}
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-lg">{children}</div>
    </div>
  );
}
