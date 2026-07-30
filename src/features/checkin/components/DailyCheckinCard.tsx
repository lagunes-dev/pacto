import { useEffect, useRef, useState } from "react";

import {
  APPROVED_TRIGGERS,
  type ApprovedTrigger,
  type CravingLevel,
  type HabitAnswer,
} from "../model";
import { useDailyCheckin } from "../queries";

type DraftAnswer = {
  state: "unset" | "done" | "event";
  trigger: ApprovedTrigger | null;
};

const CRAVING_LABELS = ["Muy bajo", "Bajo", "Moderado", "Alto", "Muy alto"] as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos consultar el servicio.";
}

function initialAnswers(goals: { id: string; answer: HabitAnswer | null }[]) {
  return Object.fromEntries(goals.map(({ id, answer }) => [id, {
    state: answer?.state ?? "unset",
    trigger: answer?.trigger ?? null,
  }])) as Record<string, DraftAnswer>;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function DailyCheckinCard() {
  const [browserTimezoneConfirmed, setBrowserTimezoneConfirmed] = useState(false);
  const { today, save } = useDailyCheckin(browserTimezoneConfirmed);
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>({});
  const [craving, setCraving] = useState<CravingLevel | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const validationRef = useRef<HTMLDivElement>(null);
  const online = useOnlineStatus();

  useEffect(() => {
    if (!today.data) return;
    const loaded = initialAnswers(today.data.goals);
    setAnswers((current) => Object.fromEntries(
      today.data.goals.map(({ id }) => [id, current[id] ?? loaded[id]]),
    ));
    setCraving((current) => current ?? today.data?.saved?.cravingLevel ?? null);
  }, [today.data]);

  useEffect(() => {
    if (validation) validationRef.current?.focus();
  }, [validation]);

  const updateAnswer = (goalId: string, state: DraftAnswer["state"]) => {
    setSavedMessage(null);
    setValidation(null);
    setAnswers((current) => ({
      ...current,
      [goalId]: { state, trigger: state === "event" ? current[goalId]?.trigger ?? null : null },
    }));
  };

  const submit = async () => {
    if (!today.data) return;
    setSavedMessage(null);
    save.reset();
    if (!online) {
      setValidation("Necesitas conexión para guardar. Tus respuestas siguen aquí, pero no se guardaron ni se pusieron en espera.");
      validationRef.current?.focus();
      return;
    }
    if (today.data.requiresBrowserConfirmation && !browserTimezoneConfirmed) {
      setValidation("Confirma tu zona horaria antes de guardar.");
      validationRef.current?.focus();
      return;
    }
    const unresolved = today.data.goals.filter(({ id }) => {
      const answer = answers[id];
      return !answer || answer.state === "unset" || (answer.state === "event" && !answer.trigger);
    });
    if (unresolved.length || craving === null) {
      const parts = [
        unresolved.length ? `Falta registrar ${unresolved.length} ${unresolved.length === 1 ? "meta" : "metas"}.` : "",
        craving === null ? "Elige tu nivel de antojo." : "",
      ].filter(Boolean);
      setValidation(parts.join(" "));
      validationRef.current?.focus();
      return;
    }
    const habits = today.data.goals.map(({ id }): HabitAnswer => {
      const answer = answers[id];
      return answer.state === "done"
        ? { goalId: id, state: "done", trigger: null }
        : { goalId: id, state: "event", trigger: answer.trigger as ApprovedTrigger };
    });
    try {
      await save.mutateAsync({ timezone: today.data.timezone, cravingLevel: craving, habits });
      setValidation(null);
      setSavedMessage("Check-in guardado. Se registró tu día sin compartir información automáticamente.");
    } catch {
      // The mutation state renders the retryable error while this local draft remains intact.
    }
  };

  if (today.isPending) {
    return <article className="home-panel checkin-card" aria-busy="true"><p role="status">Cargando tus metas para hoy…</p></article>;
  }

  if (today.isError && !today.data) {
    return (
      <article className="home-panel checkin-card service-alert" role="alert">
        <strong>No pudimos cargar tu check-in.</strong>
        <span>{errorMessage(today.error)} No mostramos ni guardamos datos sin confirmar.</span>
        <button type="button" className="text-button" onClick={() => today.refetch()}>Reintentar</button>
      </article>
    );
  }

  if (!today.data || today.data.goals.length === 0) {
    return (
      <article className="home-panel checkin-card">
        <p className="eyebrow">Check-in breve</p>
        <h2>Primero agrega una meta activa</h2>
        <p>Cuando tengas una meta personal activa, podrás registrar cómo va tu día aquí.</p>
      </article>
    );
  }

  const registered = today.data.goals.filter(({ id }) => answers[id]?.state !== "unset").length;

  return (
    <article className="home-panel checkin-card" aria-labelledby="daily-checkin-title">
      <div className="checkin-heading">
        <div>
          <p className="eyebrow">Check-in breve</p>
          <h2 id="daily-checkin-title">¿Cómo va tu día?</h2>
          <p>Cada meta tiene un estado explícito. Nada sin registrar se interpreta como incumplimiento.</p>
        </div>
        <span className="checkin-count" aria-live="polite">{registered} de {today.data.goals.length} registradas</span>
      </div>

      {today.isError && (
        <div className="service-alert" role="alert">
          <strong>No pudimos actualizar tus metas.</strong>
          <span>{errorMessage(today.error)} Tus respuestas actuales siguen aquí.</span>
          <button type="button" className="text-button" onClick={() => today.refetch()}>Reintentar</button>
        </div>
      )}

      <div className="checkin-goals">
        {today.data.goals.map((goal) => {
          const answer = answers[goal.id] ?? { state: "unset", trigger: null };
          return (
            <fieldset className="checkin-goal" key={goal.id}>
              <legend>{goal.name}</legend>
              <div className="checkin-segments" role="group" aria-label={`Estado de ${goal.name}`}>
                {(["done", "event", "unset"] as const).map((state) => (
                  <button
                    key={state}
                    type="button"
                    className={answer.state === state ? "is-selected" : ""}
                    aria-pressed={answer.state === state}
                    onClick={() => updateAnswer(goal.id, state)}
                  >
                    {state === "done" ? "Cumplido" : state === "event" ? "Hubo evento" : "Sin registrar"}
                  </button>
                ))}
              </div>
              {answer.state === "event" && (
                <div className="trigger-field">
                  <span id={`trigger-${goal.id}`}>¿Qué ocurrió?</span>
                  <div className="trigger-chips" role="group" aria-labelledby={`trigger-${goal.id}`}>
                    {APPROVED_TRIGGERS.map((trigger) => (
                      <button
                        key={trigger}
                        type="button"
                        className={answer.trigger === trigger ? "is-selected" : ""}
                        aria-pressed={answer.trigger === trigger}
                        onClick={() => {
                          setSavedMessage(null);
                          setValidation(null);
                          setAnswers((current) => ({ ...current, [goal.id]: { state: "event", trigger } }));
                        }}
                      >{trigger}</button>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      <fieldset className="craving-field">
        <legend>Nivel de antojo actual</legend>
        <span aria-live="polite">{craving ? `${CRAVING_LABELS[craving - 1]} · ${craving}/5` : "Sin registrar"}</span>
        <div className="craving-options" role="group" aria-label="Selecciona un nivel de antojo del 1 al 5">
          {([1, 2, 3, 4, 5] as const).map((level) => (
            <button
              key={level}
              type="button"
              className={craving === level ? "is-selected" : ""}
              aria-label={`Antojo ${level} de 5`}
              aria-pressed={craving === level}
              onClick={() => { setCraving(level); setValidation(null); setSavedMessage(null); }}
            >{level}</button>
          ))}
        </div>
      </fieldset>

      {today.data.requiresBrowserConfirmation && (
        <label className="timezone-confirmation">
          <input
            type="checkbox"
            checked={browserTimezoneConfirmed}
            onChange={(event) => setBrowserTimezoneConfirmed(event.target.checked)}
          />
          Confirmo usar la zona horaria de este dispositivo para este registro.
        </label>
      )}

      {validation && <div className="checkin-message" role="alert" tabIndex={-1} ref={validationRef}>{validation}</div>}
      {save.isError && (
        <div className="service-alert" role="alert">
          <strong>No se guardó tu check-in.</strong>
          <span>{errorMessage(save.error)} Tus respuestas siguen aquí para que lo intentes de nuevo.</span>
        </div>
      )}
      {savedMessage && <p className="checkin-success" role="status">{savedMessage}</p>}

      <button type="button" className="primary-button checkin-save" disabled={save.isPending} onClick={submit}>
        {save.isPending ? "Guardando…" : save.isError ? "Reintentar guardar" : "Guardar check-in"}
      </button>
      <p className="checkin-privacy">Solo se guarda este check-in cuando el servicio confirma la respuesta. No se comparte automáticamente.</p>
    </article>
  );
}
