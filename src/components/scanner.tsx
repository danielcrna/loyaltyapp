"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  lookupAction,
  purchaseAction,
  redeemCashbackAction,
  redeemCouponAction,
  redeemRewardAction,
  searchCustomersAction,
  type ScanCard,
  type ScanCoupon,
  type ScanResult,
} from "@/app/escaner/actions";

type Program = {
  type: "POINTS" | "CASHBACK" | "STAMPS";
  stampReward: string;
  stampRules: { stamps: number; reward: string; final?: boolean }[];
  stampMinPurchase: number;
  currency: string;
};
type Reward = { id: string; name: string; pointsCost: number };
type Loc = { id: string; name: string };

const money = (cents: number, currency: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(cents / 100);
const toCents = (s: string) => Math.round((Number(s.replace(",", ".")) || 0) * 100);

export function Scanner({ program, rewards, locations }: { program: Program; rewards: Reward[]; locations: Loc[] }) {
  const [result, setResult] = useState<ScanCard | ScanCoupon | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [camera, setCamera] = useState(false);
  const [locationId, setLocationId] = useState<string>("");
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("scanner.location");
      if (saved && locations.some((l) => l.id === saved)) setLocationId(saved);
      else if (locations.length === 1) setLocationId(locations[0].id);
    } catch {
      /* almacenamiento no disponible */
    }
  }, [locations]);

  const handle = useCallback((r: ScanResult) => {
    if (r.ok) {
      setResult(r.data);
      setMessage(r.message ? { tone: "ok", text: r.message } : null);
      if (r.message && navigator.vibrate) navigator.vibrate(80);
    } else {
      setMessage({ tone: "error", text: r.error });
      if (navigator.vibrate) navigator.vibrate([60, 60, 60]);
    }
  }, []);

  const lookup = useCallback(
    (code: string) => {
      const now = Date.now();
      if (lastScan.current.code === code && now - lastScan.current.at < 4000) return; // evita lecturas duplicadas
      lastScan.current = { code, at: now };
      setCamera(false);
      startTransition(async () => handle(await lookupAction(code)));
    },
    [handle],
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      {locations.length > 1 && (
        <select
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            try {
              localStorage.setItem("scanner.location", e.target.value);
            } catch {}
          }}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Sucursal…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}

      {!result && (
        <>
          {camera ? (
            <CameraReader onCode={lookup} onClose={() => setCamera(false)} />
          ) : (
            <button
              onClick={() => {
                setMessage(null);
                setCamera(true);
              }}
              className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-3xl bg-stone-900 text-white shadow-lg active:scale-[0.99]"
            >
              <span className="text-6xl">⧉</span>
              <span className="text-lg font-semibold">Escanear QR</span>
              <span className="text-xs text-stone-400">Tarjeta de lealtad o cupón</span>
            </button>
          )}
          <ManualEntry onCode={lookup} />
        </>
      )}

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-center text-sm font-semibold ${
            message.tone === "ok" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {pending && <p className="text-center text-sm text-stone-500">Procesando…</p>}

      {result?.kind === "card" && (
        <CardPanel
          card={result}
          program={program}
          rewards={rewards}
          disabled={pending}
          onAction={(fn) => startTransition(async () => handle(await fn(locationId || null)))}
        />
      )}
      {result?.kind === "coupon" && (
        <CouponPanel
          coupon={result}
          disabled={pending}
          onRedeem={() => startTransition(async () => handle(await redeemCouponAction(result.code, locationId || null)))}
        />
      )}
      {result && (
        <button
          onClick={() => {
            setResult(null);
            setMessage(null);
            lastScan.current = { code: "", at: 0 };
            setCamera(true);
          }}
          className="w-full rounded-xl border border-stone-300 bg-white py-3 font-semibold"
        >
          Escanear otro
        </button>
      )}
    </div>
  );
}

function CameraReader({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let stopped = false;
    (async () => {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (stopped) return;
      scanner = new Html5Qrcode("qr-reader", { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
          (text) => onCode(text),
          () => {},
        );
      } catch {
        setError("No se pudo abrir la cámara. Revisa los permisos del navegador (se requiere HTTPS).");
      }
    })();
    return () => {
      stopped = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [onCode]);
  return (
    <div className="space-y-2">
      <div id="qr-reader" className="overflow-hidden rounded-3xl bg-black" />
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button onClick={onClose} className="w-full rounded-xl border border-stone-300 bg-white py-2 text-sm font-semibold">
        Cerrar cámara
      </button>
    </div>
  );
}

function ManualEntry({ onCode }: { onCode: (c: string) => void }) {
  const [code, setCode] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ name: string; phone: string | null; serial: string }[]>([]);
  const [, start] = useTransition();
  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onCode(code.trim());
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código de tarjeta o cupón"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm uppercase"
          autoCapitalize="characters"
        />
        <button className="rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white">Buscar</button>
      </form>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setFound(await searchCustomersAction(q)));
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="…o teléfono / nombre del cliente"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <button className="rounded-lg border border-stone-300 px-4 text-sm font-semibold">Buscar</button>
      </form>
      {found.length > 0 && (
        <ul className="divide-y divide-stone-100 text-sm">
          {found.map((f) => (
            <li key={f.serial}>
              <button className="flex w-full justify-between py-2 text-left" onClick={() => onCode(f.serial)}>
                <span className="font-medium">{f.name}</span>
                <span className="text-stone-500">{f.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CardPanel({
  card,
  program,
  rewards,
  disabled,
  onAction,
}: {
  card: ScanCard;
  program: Program;
  rewards: Reward[];
  disabled: boolean;
  onAction: (fn: (locationId: string | null) => Promise<ScanResult>) => void;
}) {
  const [amount, setAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const cents = toCents(amount);
  const needsAmount = program.type !== "STAMPS" || program.stampMinPurchase > 0;
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold">{card.customerName}</div>
          <div className="text-xs text-stone-500">
            {card.visits} visitas · última {card.lastVisit}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-stone-500 uppercase">{card.balanceLabel}</div>
          <div className="text-2xl font-bold">{card.balanceValue}</div>
          {card.secondary && <div className="text-xs font-semibold text-emerald-700">{card.secondary}</div>}
        </div>
      </div>

      <div className="space-y-2 rounded-xl bg-stone-50 p-3">
        <div className="text-sm font-semibold">{program.type === "STAMPS" ? "Registrar visita" : "Registrar compra"}</div>
        {needsAmount && (
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={`Monto de la compra (${program.currency})`}
            className="w-full rounded-lg border border-stone-300 px-3 py-3 text-lg"
          />
        )}
        <button
          disabled={disabled || (program.type !== "STAMPS" && cents <= 0)}
          onClick={() => {
            onAction((loc) => purchaseAction(card.cardId, cents, loc));
            setAmount("");
          }}
          className="w-full rounded-xl bg-brand-600 py-3 text-base font-bold text-white disabled:opacity-50"
        >
          {program.type === "STAMPS" ? "+1 sello" : "Sumar"}
        </button>
      </div>

      {program.type === "STAMPS" && card.rewardsAvailable > 0 && (
        <button
          disabled={disabled}
          onClick={() => onAction((loc) => redeemRewardAction(card.cardId, undefined, loc))}
          className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white"
        >
          Canjear: {program.stampReward} ({card.rewardsAvailable})
        </button>
      )}

      {program.type === "STAMPS" && program.stampRules.length > 1 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Niveles de recompensa</div>
          {program.stampRules.map((r) => {
            const reachable = !r.final && card.stamps >= r.stamps;
            return r.final ? (
              <div key={r.stamps} className="flex justify-between rounded-lg border border-dashed border-stone-300 px-3 py-2 text-sm text-stone-600">
                <span>
                  {r.reward} <span className="text-xs">(al completar)</span>
                </span>
                <span className="font-semibold">
                  {card.stamps}/{r.stamps}
                </span>
              </div>
            ) : (
              <button
                key={r.stamps}
                disabled={disabled || !reachable}
                onClick={() => {
                  if (window.confirm(`¿Canjear "${r.reward}"? Se descontarán ${r.stamps} sellos y le quedarán ${card.stamps - r.stamps}.`))
                    onAction((loc) => redeemRewardAction(card.cardId, undefined, loc, r.stamps));
                }}
                className="flex w-full justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:border-stone-200 disabled:bg-white disabled:font-normal disabled:text-stone-400"
              >
                <span>Canjear: {r.reward}</span>
                <span>−{r.stamps} sellos</span>
              </button>
            );
          })}
          {program.stampRules.some((r) => !r.final && card.stamps >= r.stamps) && (
            <p className="text-xs text-stone-500">El cliente puede canjear ahora o seguir acumulando para la recompensa final.</p>
          )}
        </div>
      )}

      {program.type === "POINTS" && rewards.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Canjear recompensa</div>
          {rewards.map((r) => (
            <button
              key={r.id}
              disabled={disabled || card.points < r.pointsCost}
              onClick={() => onAction((loc) => redeemRewardAction(card.cardId, r.id, loc))}
              className="flex w-full justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm disabled:opacity-40"
            >
              <span>{r.name}</span>
              <span className="font-semibold">{r.pointsCost} pts</span>
            </button>
          ))}
        </div>
      )}

      {program.type === "CASHBACK" && card.cashbackCents > 0 && (
        <div className="space-y-2 rounded-xl bg-emerald-50 p-3">
          <div className="text-sm font-semibold">Usar saldo (disponible {money(card.cashbackCents, program.currency)})</div>
          <div className="flex gap-2">
            <input
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Monto a usar"
              className="w-full rounded-lg border border-stone-300 px-3 py-2"
            />
            <button
              onClick={() => setRedeemAmount((card.cashbackCents / 100).toFixed(2))}
              className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold"
            >
              Todo
            </button>
          </div>
          <button
            disabled={disabled || toCents(redeemAmount) <= 0}
            onClick={() => {
              onAction((loc) => redeemCashbackAction(card.cardId, toCents(redeemAmount), loc));
              setRedeemAmount("");
            }}
            className="w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white disabled:opacity-50"
          >
            Descontar del monedero
          </button>
        </div>
      )}

      {card.coupons.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Cupones activos</div>
          {card.coupons.map((c) => (
            <div key={c.code} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-2 text-sm">
              <div>
                <div className="font-semibold">
                  {c.label && <span className="mr-1 text-brand-700">{c.label}</span>}
                  {c.title}
                </div>
                {c.expires && <div className="text-xs text-stone-500">Vence {c.expires}</div>}
              </div>
              <button
                disabled={disabled}
                onClick={() => onAction((loc) => redeemCouponAction(c.code, loc, card.cardId))}
                className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                Canjear
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CouponPanel({ coupon, disabled, onRedeem }: { coupon: ScanCoupon; disabled: boolean; onRedeem: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border-2 border-dashed border-brand-300 bg-white p-5 text-center shadow-sm">
      {coupon.label && <div className="text-3xl font-black text-brand-700">{coupon.label}</div>}
      <div className="text-xl font-bold">{coupon.title}</div>
      {coupon.description && <p className="text-sm text-stone-600">{coupon.description}</p>}
      <p className="text-sm">
        Para: <strong>{coupon.customerName}</strong>
        {coupon.expires && <> · vence {coupon.expires}</>}
      </p>
      {coupon.valid ? (
        <button disabled={disabled} onClick={onRedeem} className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white">
          Canjear cupón
        </button>
      ) : (
        <div className="rounded-lg bg-red-50 p-3 font-semibold text-red-700">{coupon.reason ?? "Cupón no válido"}</div>
      )}
    </div>
  );
}
