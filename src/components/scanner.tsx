"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  lookupAction,
  purchaseAction,
  redeemCashbackAction,
  redeemCouponAction,
  redeemRewardAction,
  searchCustomersAction,
  undoPurchaseAction,
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
type Kind = "lookup" | "earn" | "redeem" | "undo";
type Message = { tone: "ok" | "error"; text: string; retry?: () => void };
type EarnMeta = { requestId: string; purchaseCents: number; before: { stamps: number; points: number } };
type LastEarn = EarnMeta & { headline: string; undoUntil: number; earnedReward: boolean };

/** Segundos que el escáner ofrece "Deshacer" (el servidor acepta hasta 2 minutos). */
const UNDO_SECONDS = 15;

const money = (cents: number, currency: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(cents / 100);

/** Campos del escáner: texto de 16 px (iOS no hace zoom al enfocar) y 48 px de alto para tocar con el pulgar. */
const FIELD =
  "block min-h-12 w-full rounded-lg border border-stone-400 bg-white px-3 text-base text-stone-900 placeholder:text-stone-500 focus:border-stone-900 focus:ring-2 focus:ring-stone-900/15 focus:outline-none disabled:bg-stone-100";
const LABEL = "text-sm font-semibold text-stone-800";

function QrIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 16V9a3 3 0 0 1 3-3h7M32 6h7a3 3 0 0 1 3 3v7M42 32v7a3 3 0 0 1-3 3h-7M16 42H9a3 3 0 0 1-3-3v-7" />
      <rect x="14" y="14" width="8" height="8" rx="1" />
      <rect x="26" y="14" width="8" height="8" rx="1" />
      <rect x="14" y="26" width="8" height="8" rx="1" />
      <path d="M27 27h2v2M33 27v.01M27 33h.01M31 31h3v3" />
    </svg>
  );
}

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
  undo: "No hubo respuesta del servidor. Reintenta: no se deshace dos veces.",
};

const PENDING_TEXT: Record<Kind, string> = {
  lookup: "Buscando tarjeta…",
  earn: "Registrando…",
  redeem: "Canjeando…",
  undo: "Deshaciendo…",
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
  const [lastEarn, setLastEarn] = useState<LastEarn | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [pendingKind, setPendingKind] = useState<Kind>("lookup");
  const earnLocked = lastEarn !== null;
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

  const handle = useCallback((r: ScanResult, kind: Kind, earn?: EarnMeta) => {
    if (r.ok) {
      setResult(r.data);
      setMessage(r.message ? { tone: "ok", text: r.message } : null);
      const earnedReward = kind === "earn" && r.earnedReward === true;
      if (kind === "earn" && earn) {
        setLastEarn({ ...earn, headline: r.message ?? "Registrado", undoUntil: Date.now() + UNDO_SECONDS * 1000, earnedReward });
        setShowSuccess(true);
      }
      if (kind === "lookup" || kind === "undo") {
        setLastEarn(null);
        setShowSuccess(false);
      }
      if (kind === "redeem") setShowSuccess(false);
      // El premio se siente distinto en la mano: un patrón más largo que el de un sello normal.
      buzz(earnedReward ? [80, 60, 80, 60, 200] : r.message ? 80 : 30);
    } else {
      setMessage({ tone: "error", text: r.error });
      buzz([60, 60, 60]);
    }
  }, []);

  /** Ejecuta una llamada al servidor; si no hay respuesta, ofrece reintentar la misma llamada. */
  const run: (exec: () => Promise<ScanResult>, kind: Kind, earn?: EarnMeta) => void = useCallback(
    (exec: () => Promise<ScanResult>, kind: Kind, earn?: EarnMeta) => {
      setMessage(null);
      setPendingKind(kind);
      startTransition(async () => {
        try {
          handle(await exec(), kind, earn);
        } catch {
          setMessage({ tone: "error", text: NO_RESPONSE[kind], retry: () => run(exec, kind, earn) });
          buzz([60, 60, 60]);
        }
      });
    },
    [handle],
  );

  const nextCustomer = () => {
    setResult(null);
    setMessage(null);
    setLastEarn(null);
    setShowSuccess(false);
    lastCameraRead.current = { code: "", at: 0 };
    setCamera(true);
  };

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
  const success = result?.kind === "card" && lastEarn !== null && showSuccess ? { card: result, earn: lastEarn } : null;

  return (
    <div data-scanner className="mx-auto max-w-md space-y-4">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {pending ? PENDING_TEXT[pendingKind] : (message?.text ?? "")}
      </p>

      {locations.length > 1 && (
        <label className="block space-y-1">
          <span className={LABEL}>Sucursal</span>
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              try {
                localStorage.setItem("scanner.location", e.target.value);
              } catch {}
            }}
            className={needsLocation ? FIELD.replace("border-stone-400", "border-amber-600") : FIELD}
          >
            <option value="">Elige la sucursal…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
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
              className="flex aspect-square max-h-[min(28rem,60svh)] w-full flex-col items-center justify-center gap-3 rounded-3xl bg-stone-900 text-white shadow-lg active:scale-[0.99]"
            >
              <QrIcon className="size-16" />
              <span className="text-xl font-semibold">Escanear QR</span>
              <span className="text-sm text-stone-300">Tarjeta de lealtad o cupón</span>
            </button>
          )}
          <ManualEntry onCode={lookup} onEdit={() => setMessage((m) => (m?.tone === "error" ? null : m))} disabled={pending} />
        </>
      )}

      {message && !(success && message.tone === "ok") && (
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
              className="min-h-11 shrink-0 rounded-lg bg-red-800 px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {pending && <p className="text-center text-sm font-semibold text-stone-600">{PENDING_TEXT[pendingKind]}</p>}

      {result && !success && blockedReason && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900">{blockedReason}</p>
      )}

      {success && (
        <SuccessPanel
          card={success.card}
          earn={success.earn}
          program={program}
          rewards={rewards}
          busy={pending}
          canRedeem={blockedReason === null}
          onRedeemNow={() => {
            const id = newRequestId();
            const cardId = success.card.cardId;
            run(() => redeemRewardAction(cardId, undefined, loc, id), "redeem");
          }}
          onUndo={() => {
            const id = success.earn.requestId;
            run(() => undoPurchaseAction(id), "undo");
          }}
          onNext={nextCustomer}
          onShowCard={() => {
            setShowSuccess(false);
            setMessage(null);
          }}
        />
      )}

      {result?.kind === "card" && !success && (
        <CardPanel
          card={result}
          program={program}
          rewards={rewards}
          disabled={actionsDisabled}
          earnLocked={earnLocked}
          onUnlockEarn={() => {
            setLastEarn(null);
            setMessage(null);
          }}
          onEarn={(cents) => {
            const earn = {
              requestId: newRequestId(),
              purchaseCents: cents,
              before: { stamps: result.stamps, points: result.points },
            };
            run(() => purchaseAction(result.cardId, cents, loc, earn.requestId), "earn", earn);
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
      {result && !success && (
        <button type="button" onClick={nextCustomer} className="min-h-12 w-full rounded-xl border border-stone-400 bg-white font-semibold">
          Siguiente cliente
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
            className="min-h-12 w-full rounded-xl bg-red-800 font-bold text-white"
          >
            Reintentar cámara
          </button>
        </div>
      )}
      <button type="button" onClick={onClose} className="min-h-12 w-full rounded-xl border border-stone-400 bg-white font-semibold">
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
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4">
      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onCode(code.trim());
        }}
      >
        <label htmlFor="scan-code" className={LABEL}>
          Código de tarjeta o cupón
        </label>
        <div className="flex gap-2">
          <input
            id="scan-code"
            aria-describedby="scan-code-hint"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              onEdit();
            }}
            placeholder="C… o P…"
            className={`${FIELD} font-mono uppercase`}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            aria-label="Buscar código"
            disabled={disabled || !code.trim()}
            className="min-h-12 shrink-0 rounded-lg bg-stone-900 px-4 font-semibold text-white disabled:opacity-50"
          >
            Buscar
          </button>
        </div>
        <p id="scan-code-hint" className="text-sm text-stone-600">
          Las tarjetas empiezan con C y los cupones con P.
        </p>
      </form>
      <form
        className="space-y-1"
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
        <label htmlFor="scan-search" className={LABEL}>
          Buscar cliente sin tarjeta
        </label>
        <div className="flex gap-2">
          <input
            id="scan-search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onEdit();
              if (search.status !== "idle" && search.status !== "searching") setSearch({ status: "idle" });
            }}
            placeholder="Teléfono o nombre"
            className={FIELD}
            autoComplete="off"
            enterKeyHint="search"
          />
          <button
            aria-label="Buscar cliente"
            disabled={search.status === "searching"}
            className="min-h-12 shrink-0 rounded-lg border border-stone-400 px-4 font-semibold disabled:opacity-50"
          >
            Buscar
          </button>
        </div>
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
          <ul className="divide-y divide-stone-100 text-base">
            {search.customers.map((f) => (
              <li key={f.serial}>
                <button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 text-left" onClick={() => onCode(f.serial)}>
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
            {card.visits === 0
              ? "Sin visitas registradas"
              : `${card.visits} ${card.visits === 1 ? "visita" : "visitas"} · última ${card.lastVisit}`}
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
            <span className="text-sm font-semibold text-emerald-900">{isStamps ? "Visita registrada" : "Compra registrada"}</span>
            <button
              type="button"
              onClick={onUnlockEarn}
              className="min-h-11 rounded-lg border border-emerald-800/30 bg-white px-3 text-sm font-semibold text-emerald-900"
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
                <label htmlFor="scan-amount" className="sr-only">
                  Monto de la compra en {program.currency}
                </label>
                <input
                  id="scan-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder={`Monto de la compra (${program.currency})`}
                  className={`${FIELD} min-h-14 text-lg tabular-nums`}
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
              className="min-h-14 w-full rounded-xl bg-brand-700 text-lg font-bold text-white disabled:opacity-50"
            >
              {isStamps ? "+1 sello" : program.type === "POINTS" ? "Sumar puntos" : "Sumar al monedero"}
            </button>
          </form>
        )}
      </div>

      {isStamps && card.rewardsAvailable > 0 && (
        <ConfirmButton
          disabled={disabled}
          onConfirm={() => onRedeemReward(undefined)}
          confirmLabel={`Confirmar canje: ${program.stampReward}`}
          className="min-h-12 w-full rounded-xl bg-emerald-700 px-3 font-bold text-white"
        >
          Canjear {program.stampReward}
          {card.rewardsAvailable > 1 && <span className="font-normal"> · {card.rewardsAvailable} disponibles</span>}
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
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-stone-300 px-3 text-left"
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
              aria-label="Monto a usar del monedero"
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Monto a usar"
              className={`${FIELD} tabular-nums`}
            />
            <button
              type="button"
              onClick={() => setRedeemAmount((card.cashbackCents / 100).toFixed(2))}
              className="min-h-12 shrink-0 rounded-lg border border-stone-400 bg-white px-4 text-sm font-semibold"
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
            className="min-h-12 w-full rounded-xl bg-emerald-700 px-3 font-bold text-white"
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
                className="min-h-11 shrink-0 rounded-lg bg-brand-700 px-4 text-sm font-bold text-white"
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

function useSecondsLeft(until: number) {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [left, until]);
  return left;
}

/** Lo que ve el cajero justo después de registrar: el resultado, el saldo nuevo y el siguiente paso. */
/**
 * Tira de sellos de la tarjeta. El sello recién ganado cae con la animación de sello de goma;
 * cuando la tarjeta se completa, todos los sellos toman el color de la marca.
 */
function StampStrip({ required, filled, fresh, complete }: { required: number; filled: number; fresh: number; complete: boolean }) {
  const total = Math.max(1, required);
  return (
    <div role="img" aria-label={`${Math.min(filled, total)} de ${total} sellos`} className="flex flex-wrap justify-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const on = i < filled;
        return (
          <span
            key={i}
            className={`grid size-8 place-items-center rounded-full ${
              on ? (complete ? "bg-brand-600 text-white" : "bg-emerald-700 text-white") : "border-2 border-dashed border-stone-300"
            } ${i === fresh ? "motion-safe:animate-stamp-press" : ""}`}
          >
            {on && (
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        );
      })}
    </div>
  );
}

function SuccessPanel({
  card,
  earn,
  program,
  rewards,
  busy,
  canRedeem,
  onRedeemNow,
  onUndo,
  onNext,
  onShowCard,
}: {
  card: ScanCard;
  earn: LastEarn;
  program: Program;
  rewards: Reward[];
  busy: boolean;
  canRedeem: boolean;
  onRedeemNow: () => void;
  onUndo: () => void;
  onNext: () => void;
  onShowCard: () => void;
}) {
  const secondsLeft = useSecondsLeft(earn.undoUntil);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  const isStamps = program.type === "STAMPS";
  const stampAdded = card.stamps > earn.before.stamps;
  const strip = earn.earnedReward
    ? { filled: card.stampsRequired, fresh: card.stampsRequired - 1 }
    : { filled: card.stamps, fresh: stampAdded ? card.stamps - 1 : -1 };
  // En puntos, avisa qué recompensas acaba de alcanzar el cliente con esta compra.
  const newlyAffordable =
    program.type === "POINTS" ? rewards.filter((r) => r.pointsCost > earn.before.points && r.pointsCost <= card.points) : [];
  const firstName = card.customerName.split(" ")[0] || card.customerName;

  return (
    <section
      aria-labelledby="scan-success"
      className={`space-y-5 rounded-2xl border bg-white p-5 text-center shadow-sm ${
        earn.earnedReward ? "border-brand-200" : "border-emerald-200"
      }`}
    >
      <div className="space-y-1">
        <p id="scan-success" className={`text-3xl font-black text-balance ${earn.earnedReward ? "text-brand-700" : "text-emerald-800"}`}>
          {earn.earnedReward ? "¡Tarjeta completa!" : earn.headline}
        </p>
        <p className="text-base font-semibold text-stone-900">{card.customerName}</p>
        {earn.purchaseCents > 0 && <p className="text-sm text-stone-600">Compra de {money(earn.purchaseCents, program.currency)}</p>}
      </div>

      {isStamps ? (
        <StampStrip required={card.stampsRequired} filled={strip.filled} fresh={strip.fresh} complete={earn.earnedReward} />
      ) : (
        <div className="rounded-xl bg-stone-50 py-3">
          <div className="text-xs font-semibold text-stone-500 uppercase">{card.balanceLabel}</div>
          <div className="text-2xl font-bold tabular-nums">{card.balanceValue}</div>
        </div>
      )}

      {earn.earnedReward ? (
        <div className="space-y-3 rounded-2xl bg-brand-50 p-4 motion-safe:animate-reward-in">
          <p className="text-xl font-bold text-balance text-stone-900">Ganó: {program.stampReward}</p>
          <p className="text-sm text-stone-700">Avísale a {firstName}. Puede canjearlo ahora o en su próxima visita.</p>
          <ConfirmButton
            disabled={busy || !canRedeem}
            onConfirm={onRedeemNow}
            confirmLabel={`Confirmar canje: ${program.stampReward}`}
            className="min-h-12 w-full rounded-xl bg-brand-700 font-bold text-white"
          >
            Canjear ahora
          </ConfirmButton>
        </div>
      ) : (
        isStamps && card.secondary && <p className="text-sm font-semibold text-emerald-800">{card.secondary}</p>
      )}

      {newlyAffordable.length > 0 && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          Ya le alcanza para: {newlyAffordable.map((r) => r.name).join(", ")}
        </p>
      )}

      <button
        ref={nextRef}
        type="button"
        onClick={onNext}
        className="w-full rounded-xl bg-stone-900 py-4 text-lg font-bold text-white focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Siguiente cliente
      </button>

      {secondsLeft > 0 ? (
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          className="min-h-12 w-full rounded-xl border border-stone-400 bg-white font-semibold text-stone-800 disabled:opacity-50"
        >
          Deshacer <span className="font-normal text-stone-500 tabular-nums">({secondsLeft} s)</span>
        </button>
      ) : (
        <p className="text-sm text-stone-600">¿Hubo un error? Pide al encargado un ajuste en el panel.</p>
      )}

      <button type="button" onClick={onShowCard} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-stone-700 underline underline-offset-4">
        Ver tarjeta y canjes
      </button>
    </section>
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
          className="min-h-12 w-full rounded-xl bg-brand-700 px-3 font-bold text-white"
        >
          Canjear cupón
        </ConfirmButton>
      ) : (
        <div className="rounded-lg bg-red-50 p-3 font-semibold text-red-700">{coupon.reason ?? "Cupón no válido"}</div>
      )}
    </div>
  );
}
