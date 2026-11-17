import { config } from "@/lib/config";

/**
 * Botones para agregar a Apple Wallet / Google Wallet.
 * Nota: para producción reemplaza estos botones por los badges oficiales:
 *  - Apple: https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/
 *  - Google: https://developers.google.com/wallet/generic/resources/brand-guidelines
 */
export function WalletButtons({ appleHref, googleHref }: { appleHref: string; googleHref: string }) {
  if (!config.apple.enabled && !config.google.enabled) return null;
  return (
    <div className="flex flex-col gap-3">
      {config.apple.enabled && (
        <a
          href={appleHref}
          className="flex items-center justify-center gap-3 rounded-xl bg-black px-5 py-3 text-white shadow-md active:scale-[0.99]"
        >
          <svg viewBox="0 0 24 24" className="size-6 fill-white" aria-hidden>
            <path d="M16.37 12.6c.02 2.6 2.28 3.46 2.3 3.47-.02.06-.36 1.23-1.19 2.44-.72 1.05-1.46 2.09-2.64 2.11-1.15.02-1.52-.68-2.84-.68-1.32 0-1.73.66-2.82.7-1.13.04-2-1.13-2.72-2.18-1.48-2.14-2.6-6.04-1.09-8.68.75-1.31 2.1-2.14 3.56-2.16 1.11-.02 2.16.75 2.84.75.68 0 1.95-.93 3.29-.79.56.02 2.13.23 3.14 1.7-.08.05-1.87 1.09-1.85 3.26M14.2 4.97c.6-.73 1-1.74.89-2.75-.86.03-1.91.58-2.53 1.3-.55.64-1.04 1.67-.91 2.66.96.07 1.94-.49 2.55-1.21" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[11px]">Agregar a</span>
            <span className="block text-base font-semibold">Apple Wallet</span>
          </span>
        </a>
      )}
      {config.google.enabled && (
        <a
          href={googleHref}
          className="flex items-center justify-center gap-3 rounded-xl bg-[#1f1f1f] px-5 py-3 text-white shadow-md active:scale-[0.99]"
        >
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            <path fill="#4285F4" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5V9H3z" />
            <path fill="#34A853" d="M3 9h18v3H3z" />
            <path fill="#FBBC04" d="M3 12h18v3H3z" />
            <path fill="#EA4335" d="M3 15h18v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
          </svg>
          <span className="text-left leading-tight">
            <span className="block text-[11px]">Agregar a</span>
            <span className="block text-base font-semibold">Google Wallet</span>
          </span>
        </a>
      )}
    </div>
  );
}
