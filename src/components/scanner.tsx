"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  lookupAction,
  purchaseAction,
  redeemCashbackAction,
  redeemCouponAction,
  redeemRewardAction,
  searchCustomersAction,
  type CustomerMatch,
  type ScanCard,
  type ScanCoupon,
  type ScanResult,
} from "@/app/escaner/actions";
import { parseMoneyToCents } from "@/lib/format";

type Program = {
  type: "POINTS" | "CASHBACK" | "STAMPS";
  stampReward: string;
  stampMinPurchase: number;
  currency: string;
};
type Reward = { id: string; name: string; pointsCost: number };
type Loc = { id: string; name: string };
type Kind = "lookup" | "earn" | "redeem";
type Message = { tone: "ok" | "error"; text: string; retry?: () => void };

const money = (cents: number, currency: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(cents / 100);

/** Clave única por movimiento: un reintento la reutiliza para que el servidor no lo registre dos veces. */
function newRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibración no disponible */
  }
}

const NO_RESPONSE: Record<Kind, string> = {
  lookup: "Sin conexión con el servidor. Revisa el internet e intenta de nuevo.",
  earn: "No hubo respuesta del servidor. Reintenta: si ya se había registrado, no se duplica.",
  redeem: "No hubo respuesta del servidor. Reintenta: si ya se había canjeado, no se duplica.",
};

export function Scanner({
  program,
  rewards,
  locations,
  canTransact,
}: {
  program: Program;
  rewards: Reward[];
  locations: Loc[];
  canTransact: boolean;
}) {
  const [result, setResult] = useState<ScanCard | ScanCoupon | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();
  const [camera, setCamera] = useState(false);
  const [locationId, setLocationId] = useState<string>("");
  const [earnLocked, setEarnLocked] = useState(false);
  const lastCameraRead = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("scanner.location");
      if (saved && locations.some((l) => l.id === saved)) setLocationId(saved);
      else if (locations.length === 1) setLocationId(locations[0].id);
    } catch {
      /* almacenamiento no disponible */
    }
  }, [locations]);

  const needsLocation = locations.length > 1 && !locationId;
  const blockedReason = !canTransact
    ? "La suscripción no está activa: no se pueden registrar movimientos."
    : needsLocation
      ? "Elige la sucursal para registrar movimientos."
      : null;

  const handle = useCallback((r: ScanResult, kind: Kind) => {
    if (r.ok) {
      setResult(r.data);
      setMessage(r.message ? { tone: "ok", text: r.message } : null);
      if (kind === "earn") setEarnLocked(true);
      if (kind === "lookup") setEarnLocked(false);
      buzz(r.message ? 80 : 30);
    } else {
      setMessage({ tone: "error", text: r.error });
      buzz([60, 60, 60]);
    }
  }, []);

  /** Ejecuta una llamada al servidor; si no hay respuesta, ofrece reintentar la misma llamada. */
  const run: (exec: () => Promise<ScanResult>, kind: Kind) => void = useCallback(
    (exec: () => Promise<ScanResult>, kind: Kind) => {
      setMessage(null);
      startTransition(async () => {
        try {
          handle(await exec(), kind);
        } catch {
          setMessage({ tone: "error", text: NO_RESPONSE[kind], retry: () => run(exec, kind) });
          buzz([60, 60, 60]);
        }
      });
    },
    [handle],
  );

  const lookup = useCallback(
    (code: string) => {
      setCamera(false);
      run(() => lookupAction(code), "lookup");
    },
    [run],
  );

  // La cámara puede leer el mismo QR varias veces seguidas; solo cuenta la primera lectura.
  const lookupFromCamera = useCallback(
    (code: string) => {
      const now = Date.now();
      if (lastCameraRead.current.code === code && now - lastCameraRead.current.at < 4000) return;
      lastCameraRead.current = { code, at: now };
      lookup(code);
    },
    [lookup],
  );

  const loc = locationId || null;
  const actionsDisabled = pending || blockedReason !== null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {pending ? "Procesando" : (message?.text ?? "")}
      </p>

      {locations.length > 1 && (
        <select
          aria-label="Sucursal"
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            try {
              localStorage.setItem("scanner.location", e.target.value);
            } catch {}
          }}
          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm ${needsLocation ? "border-amber-500" : "border-stone-300"}`}
        >
          <option value="">Elige la sucursal…</option>
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
            <CameraReader onCode={lookupFromCamera} onClose={() => setCamera(false)} />
          ) : (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setCamera(true);
              }}
              className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-3xl bg-stone-900 text-white shadow-lg active:scale-[0.99]"
            >
              <span className="text-6xl" aria-hidden="true">
                ⧉
              </span>
              <span className="text-lg font-semibold">Escanear QR</span>
              <span className="text-xs text-stone-400">Tarjeta de lealtad o cupón</span>
            </button>
          )}
          <ManualEntry onCode={lookup} onEdit={() => setMessage((m) => (m?.tone === "error" ? null : m))} disabled={pending} />
        </>
      )}

      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${
            message.tone === "ok" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-800"
          } ${message.retry ? "justify-between text-left" : "justify-center text-center"}`}
        >
          <span>{message.text}</span>
          {message.retry && (
            <button
              type="button"
              onClick={message.retry}
              disabled={pending}
              className="shrink-0 rounded-lg bg-red-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {pending && <p className="text-center text-sm text-stone-500">Procesando…</p>}

      {result && blockedReason && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900">{blockedReason}</p>
      )}

      {result?.kind === "card" && (
        <CardPanel
          card={result}
          program={program}
          rewards={rewards}
          disabled={actionsDisabled}
          earnLocked={earnLocked}
          onUnlockEarn={() => {
            setEarnLocked(false);
            setMessage(null);
          }}
          onEarn={(cents) => {
            const id = newRequestId();
            run(() => purchaseAction(result.cardId, cents, loc, id), "earn");
          }}
          onRedeemReward={(rewardId) => {
            const id = newRequestId();
            run(() => redeemRewardAction(result.cardId, rewardId, loc, id), "redeem");
          }}
          onRedeemCashback={(cents) => {
            const id = newRequestId();
            run(() => redeemCashbackAction(result.cardId, cents, loc, id), "redeem");
          }}
          onRedeemCoupon={(code) => {
            const id = newRequestId();
            run(() => redeemCouponAction(code, loc, result.cardId, id), "redeem");
          }}
        />
      )}
      {result?.kind === "coupon" && (
        <CouponPanel
          coupon={result}
          disabled={actionsDisabled}
          onRedeem={() => {
            const id = newRequestId();
            run(() => redeemCouponAction(result.code, loc, undefined, id), "redeem");
          }}
        />
      )}
      {result && (
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setMessage(null);
            setEarnLocked(false);
            lastCameraRead.current = { code: "", at: 0 };
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
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (stopped) return;
        scanner = new Html5Qrcode("qr-reader", { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
          (text) => onCode(text),
          () => {},
        );
      } catch {
        if (!stopped)
          setError("No se pudo abrir la cámara. Permite el acceso a la cámara en el navegador o escribe el código abajo.");
      }
    })();
    return () => {
      stopped = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [onCode, attempt]);
  return (
    <div className="space-y-2">
      <div id="qr-reader" className={error ? "hidden" : "overflow-hidden rounded-3xl bg-black"} />
      {error && (
        <div className="space-y-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
            className="w-full rounded-xl bg-red-800 py-3 font-bold text-white"
          >
            Reintentar cámara
          </button>
        </div>
      )}
      <button type="button" onClick={onClose} className="w-full rounded-xl border border-stone-300 bg-white py-2 text-sm font-semibold">
        Cerrar cámara
      </button>
    </div>
  );
}

type SearchState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; term: string; customers: CustomerMatch[] }
  | { status: "short" }
  | { status: "error"; error: string };

function ManualEntry({ onCode, onEdit, disabled }: { onCode: (c: string) => void; onEdit: () => void; disabled: boolean }) {
  const [code, setCode] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
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
          onChange={(e) => {
            setCode(e.target.value);
            onEdit();
          }}
          placeholder="Código de tarjeta o cupón"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm uppercase"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <button disabled={disabled || !code.trim()} className="rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-50">
          Buscar
        </button>
      </form>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const term = q.trim();
          if (term.length < 3) {
            setSearch({ status: "short" });
            return;
          }
          setSearch({ status: "searching" });
          start(async () => {
            try {
              const r = await searchCustomersAction(term);
              setSearch(r.ok ? { status: "done", term, customers: r.customers } : { status: "error", error: r.error });
            } catch {
              setSearch({ status: "error", error: "Sin conexión con el servidor. Revisa el internet e intenta de nuevo." });
            }
          });
        }}
      >
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            onEdit();
            if (search.status !== "idle" && search.status !== "searching") setSearch({ status: "idle" });
          }}
          placeholder="…o teléfono / nombre del cliente"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          autoComplete="off"
        />
        <button
          disabled={search.status === "searching"}
          className="rounded-lg border border-stone-300 px-4 text-sm font-semibold disabled:opacity-50"
        >
          Buscar
        </button>
      </form>
      <div aria-live="polite">
        {search.status === "searching" && <p className="text-sm text-stone-500">Buscando…</p>}
        {search.status === "short" && <p className="text-sm text-stone-600">Escribe al menos 3 letras del nombre o 4 dígitos del teléfono.</p>}
        {search.status === "error" && <p className="text-sm font-semibold text-red-700">{search.error}</p>}
        {search.status === "done" && search.customers.length === 0 && (
          <p className="text-sm text-stone-600">
            Ningún cliente coincide con «{search.term}». Revisa cómo se escribe o inscríbelo con el QR del negocio.
          </p>
        )}
        {search.status === "done" && search.customers.length > 0 && (
          <ul className="divide-y divide-stone-100 text-sm">
            {search.customers.map((f) => (
              <li key={f.serial}>
                <button type="button" className="flex w-full justify-between gap-3 py-2 text-left" onClick={() => onCode(f.serial)}>
                  <span className="min-w-0 truncate font-medium">{f.name}</span>
                  <span className="shrink-0 text-stone-500">{f.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Botón de dos pasos para movimientos que no se pueden deshacer desde el escáner.
 * El primer toque pide confirmación; un segundo toque inmediato (doble toque accidental) se ignora.
 */
function ConfirmButton({
  onConfirm,
  disabled,
  className,
  confirmLabel,
  children,
}: {
  onConfirm: () => void;
  disabled: boolean;
  className: string;
  confirmLabel: string;
  children: ReactNode;
}) {
  const [armedAt, setArmedAt] = useState<number | null>(null);
  useEffect(() => {
    if (armedAt === null) return;
    const t = setTimeout(() => setArmedAt(null), 5000);
    return () => clearTimeout(t);
  }, [armedAt]);
  const armed = armedAt !== null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmedAt(Date.now());
        if (Date.now() - armedAt < 400) return;
        setArmedAt(null);
        onConfirm();
      }}
      className={`${className} ${armed ? "bg-stone-900! text-white! ring-2 ring-stone-900 ring-offset-2" : ""} disabled:opacity-50`}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

function CardPanel({
  card,
  program,
  rewards,
  disabled,
  earnLocked,
  onUnlockEarn,
  onEarn,
  onRedeemReward,
  onRedeemCashback,
  onRedeemCoupon,
}: {
  card: ScanCard;
  program: Program;
  rewards: Reward[];
  disabled: boolean;
  earnLocked: boolean;
  onUnlockEarn: () => void;
  onEarn: (cents: number) => void;
  onRedeemReward: (rewardId?: string) => void;
  onRedeemCashback: (cents: number) => void;
  onRedeemCoupon: (code: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const cents = parseMoneyToCents(amount);
  const redeemCents = parseMoneyToCents(redeemAmount);
  const needsAmount = program.type !== "STAMPS" || program.stampMinPurchase > 0;
  const isStamps = program.type === "STAMPS";

  // El monto se conserva si el registro falla; se limpia solo cuando quedó registrado.
  useEffect(() => {
    if (earnLocked) setAmount("");
  }, [earnLocked]);
  const lastCashback = useRef(card.cashbackCents);
  useEffect(() => {
    if (card.cashbackCents !== lastCashback.current) setRedeemAmount("");
    lastCashback.current = card.cashbackCents;
  }, [card.cashbackCents]);

  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{card.customerName}</div>
          <div className="text-xs text-stone-500">
            {card.visits} visitas · última {card.lastVisit}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold text-stone-500 uppercase">{card.balanceLabel}</div>
          <div className="text-2xl font-bold">{card.balanceValue}</div>
          {card.secondary && <div className="text-xs font-semibold text-emerald-700">{card.secondary}</div>}
        </div>
      </div>

      <div className="space-y-2 rounded-xl bg-stone-50 p-3">
        <div className="text-sm font-semibold">{isStamps ? "Registrar visita" : "Registrar compra"}</div>
        {earnLocked ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2">
            <span className="text-sm font-semibold text-emerald-900">Registrado</span>
            <button
              type="button"
              onClick={onUnlockEarn}
              className="rounded-lg border border-emerald-800/30 bg-white px-3 py-2 text-sm font-semibold text-emerald-900"
            >
              {isStamps ? "Registrar otra visita" : "Registrar otra compra"}
            </button>
          </div>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (disabled || (needsAmount && cents <= 0)) return;
              onEarn(cents);
            }}
          >
            {needsAmount && (
              <>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder={`Monto de la compra (${program.currency})`}
                  className="w-full rounded-lg border border-stone-300 px-3 py-3 text-lg"
                />
                {amount.trim() !== "" && (
                  <p className={`text-sm ${cents > 0 ? "text-stone-600" : "font-semibold text-red-700"}`}>
                    {cents > 0 ? `Se registrará ${money(cents, program.currency)}` : "Monto no válido. Ejemplo: 1,500.50"}
                  </p>
                )}
              </>
            )}
            <button
              disabled={disabled || (needsAmount && cents <= 0)}
              className="w-full rounded-xl bg-brand-600 py-3 text-base font-bold text-white disabled:opacity-50"
            >
              {isStamps ? "+1 sello" : "Sumar"}
            </button>
          </form>
        )}
      </div>

      {isStamps && card.rewardsAvailable > 0 && (
        <ConfirmButton
          disabled={disabled}
          onConfirm={() => onRedeemReward(undefined)}
          confirmLabel={`Confirmar canje: ${program.stampReward}`}
          className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white"
        >
          Canjear: {program.stampReward} ({card.rewardsAvailable})
        </ConfirmButton>
      )}

      {program.type === "POINTS" && rewards.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Canjear recompensa</div>
          {rewards.map((r) => (
            <ConfirmButton
              key={r.id}
              disabled={disabled || card.points < r.pointsCost}
              onConfirm={() => onRedeemReward(r.id)}
              confirmLabel={`Confirmar canje: ${r.name}`}
              className="flex w-full justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm"
            >
              <span>{r.name}</span>
              <span className="font-semibold">{r.pointsCost} pts</span>
            </ConfirmButton>
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
              autoComplete="off"
              placeholder="Monto a usar"
              className="w-full rounded-lg border border-stone-300 px-3 py-2"
            />
            <button
              type="button"
              onClick={() => setRedeemAmount((card.cashbackCents / 100).toFixed(2))}
              className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold"
            >
              Todo
            </button>
          </div>
          {redeemAmount.trim() !== "" && redeemCents <= 0 && (
            <p className="text-sm font-semibold text-red-700">Monto no válido. Ejemplo: 150.50</p>
          )}
          {redeemCents > card.cashbackCents && (
            <p className="text-sm font-semibold text-red-700">Es más que el saldo disponible.</p>
          )}
          <ConfirmButton
            disabled={disabled || redeemCents <= 0 || redeemCents > card.cashbackCents}
            onConfirm={() => onRedeemCashback(redeemCents)}
            confirmLabel={`Confirmar: descontar ${money(redeemCents, program.currency)}`}
            className="w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white"
          >
            Descontar del monedero
          </ConfirmButton>
        </div>
      )}

      {card.coupons.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Cupones activos</div>
          {card.coupons.map((c) => (
            <div key={c.code} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-semibold">
                  {c.label && <span className="mr-1 text-brand-700">{c.label}</span>}
                  {c.title}
                </div>
                {c.expires && <div className="text-xs text-stone-500">Vence {c.expires}</div>}
              </div>
              <ConfirmButton
                disabled={disabled}
                onConfirm={() => onRedeemCoupon(c.code)}
                confirmLabel="Confirmar"
                className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                Canjear
              </ConfirmButton>
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
        <ConfirmButton
          disabled={disabled}
          onConfirm={onRedeem}
          confirmLabel={`Confirmar canje: ${coupon.title}`}
          className="w-full rounded-xl bg-brand-600 py-3 font-bold text-white"
        >
          Canjear cupón
        </ConfirmButton>
      ) : (
        <div className="rounded-lg bg-red-50 p-3 font-semibold text-red-700">{coupon.reason ?? "Cupón no válido"}</div>
      )}
    </div>
  );
}
