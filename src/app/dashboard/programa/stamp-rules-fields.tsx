"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";

/** Campos de reglas del programa de sellos: 1 regla (recompensa final) o 2 reglas (nivel intermedio + final). */
export function StampRulesFields(props: { stampsRequired: number; stampReward: string; tierStamps?: number; tierReward?: string }) {
  const [count, setCount] = useState(props.tierStamps ? "2" : "1");
  const [total, setTotal] = useState(props.stampsRequired);
  return (
    <div className="space-y-3">
      <Field
        label="Reglas de recompensa"
        hint={count === "2" ? "El cliente decide si canjea el nivel 1 o sigue acumulando para el nivel 2." : "Ej. 10 sellos = bebida gratis."}
      >
        <Select name="stampRuleCount" value={count} onChange={(e) => setCount(e.target.value)}>
          <option value="1">1 regla</option>
          <option value="2">2 reglas (con nivel intermedio)</option>
        </Select>
      </Field>
      {count === "2" && (
        <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
          <p className="text-xs font-semibold text-brand-700">Nivel 1 (opcional para el cliente)</p>
          <Field label="Sellos" hint={`Menos de ${total}. Al canjearlo se descuentan estos sellos.`}>
            <Input name="tierStamps" type="number" min={1} max={Math.max(1, total - 1)} defaultValue={props.tierStamps ?? Math.max(1, Math.floor(total / 2))} />
          </Field>
          <Field label="Recompensa">
            <Input name="tierReward" maxLength={60} defaultValue={props.tierReward ?? ""} placeholder="Americano chico" />
          </Field>
        </div>
      )}
      <div className={count === "2" ? "space-y-3 rounded-xl border border-stone-200 p-3" : "space-y-3"}>
        {count === "2" && <p className="text-xs font-semibold text-stone-600">Nivel 2 (tarjeta completa)</p>}
        <Field label="Sellos para completar la tarjeta">
          <Input
            name="stampsRequired"
            type="number"
            min={count === "2" ? 2 : 1}
            max={20}
            defaultValue={props.stampsRequired}
            onChange={(e) => setTotal(Number(e.target.value) || props.stampsRequired)}
          />
        </Field>
        <Field label="Recompensa al completar">
          <Input name="stampReward" defaultValue={props.stampReward} maxLength={60} />
        </Field>
      </div>
    </div>
  );
}
