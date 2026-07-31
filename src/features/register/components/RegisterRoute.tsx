import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";

import { useRecoveryTimeline, useSaveRecovery } from "../../recovery/queries";

const initialDraft = { trigger: "", moment: "Después de cenar", need: "Una alternativa preparada", alternative: "", privateNote: "" };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos consultar el servicio.";
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

export function RegisterRoute() {
  const timeline = useRecoveryTimeline();
  const save = useSaveRecovery();
  const online = useOnline();
  const [draft, setDraft] = useState(initialDraft);
  const [notice, setNotice] = useState<string | null>(null);
  const revision = timeline.data?.[0]?.revision ?? 0;
  const preview = `Si vuelve ${draft.trigger ? `el ${draft.trigger.toLowerCase()}` : "esta situación"} ${draft.moment.toLowerCase()}, entonces ${draft.alternative.trim() || "elegiré una alternativa preparada"}.`;
  const update = (field: keyof typeof draft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setNotice(null);
  };
  const clear = () => { setDraft(initialDraft); setNotice("Se limpió el borrador. No se guardó ningún cambio."); save.reset(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    if (!online) {
      setNotice("Estás sin conexión. El plan no se guardó ni se puso en espera.");
      return;
    }
    try {
      await save.mutateAsync({ ...draft, operationId: crypto.randomUUID(), expectedRevision: revision });
      setDraft(initialDraft);
      setNotice("Plan guardado. Ya aparece en tu línea de tiempo y en Inicio.");
    } catch {
      // The mutation exposes the repository error without discarding the local draft.
    }
  };

  return (
    <section className="register-page" aria-labelledby="register-view-title">
      <header>
        <p className="eyebrow">Registro y recuperación</p>
        <h1 id="register-view-title">Entender, corregir, continuar.</h1>
        <p className="route-lead">Un evento no arruina el día. Convierte lo ocurrido en un plan concreto para la próxima decisión.</p>
      </header>

      <div className="register-layout">
        <form className="recovery-panel" onSubmit={submit}>
          <div className="recovery-heading"><div><p className="eyebrow">Flujo de recuperación</p><h2>Crea tu plan “si–entonces”</h2></div><span className="privacy-chip">Privado</span></div>
          <div className="recovery-form-grid">
            <label className="full">¿Qué ocurrió?<select value={draft.trigger} onChange={(event) => update("trigger", event.target.value)} required><option value="">Selecciona una situación</option><option>Antojo</option><option>Comida social</option><option>No había alternativa</option><option>Hambre intensa</option><option>Estrés</option><option>Costumbre</option></select></label>
            <label>Momento<select value={draft.moment} onChange={(event) => update("moment", event.target.value)}><option>Después de cenar</option><option>Durante el trabajo</option><option>Al salir de casa</option><option>En una reunión</option><option>Antes de dormir</option></select></label>
            <label>¿Qué necesitabas?<select value={draft.need} onChange={(event) => update("need", event.target.value)}><option>Una alternativa preparada</option><option>Comer algo suficiente</option><option>Reducir estrés</option><option>Compañía</option><option>Tomar una pausa</option></select></label>
            <label className="full">Alternativa para la próxima vez<input value={draft.alternative} onChange={(event) => update("alternative", event.target.value)} maxLength={500} required /></label>
            <label className="full">Nota privada opcional<textarea value={draft.privateNote} onChange={(event) => update("privateNote", event.target.value)} maxLength={4000} placeholder="Sólo tú puedes leer esto." /><small>Separada de los datos compartidos. No se incluye en solicitudes de apoyo.</small></label>
          </div>
          <blockquote className="plan-preview"><q>{preview}</q><small>El objetivo es facilitar una alternativa, no imponer una prohibición.</small></blockquote>
          {!online && <p className="service-alert" role="alert">Sin conexión. Puedes conservar este borrador, pero no guardarlo todavía.</p>}
          {save.isError && <p className="service-alert" role="alert"><strong>No se guardó el plan.</strong> {errorMessage(save.error)} Tu borrador sigue aquí.</p>}
          {notice && <p className={notice.startsWith("Estás") ? "service-alert" : "notice"} role="status">{notice}</p>}
          <div className="form-actions"><button className="secondary-button" type="button" onClick={clear}>Limpiar</button><button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending ? "Guardando…" : "Guardar plan y continuar"}</button></div>
          <Link className="text-link" to="/habits/new">Administrar hábitos personales</Link>
        </form>

        <aside className="register-side" aria-label="Historial de recuperación">
          <article className="home-panel"><p className="eyebrow">Cómo funciona</p><ol className="recovery-steps"><li><strong>Reconoce el detonante</strong><span>Contexto, momento y necesidad, sin juicio.</span></li><li><strong>Elige una alternativa</strong><span>Algo disponible y suficientemente fácil.</span></li><li><strong>Prueba y registra</strong><span>Después podrás revisar qué funcionó.</span></li></ol></article>
          <article className="home-panel"><p className="eyebrow">Últimos registros</p>
            {timeline.isPending && <p role="status">Cargando tus registros…</p>}
            {timeline.isError && <div className="service-alert" role="alert"><strong>No pudimos cargar tus registros.</strong><span>{errorMessage(timeline.error)} No mostramos datos sin confirmar.</span><button className="text-button" type="button" onClick={() => timeline.refetch()}>Reintentar</button></div>}
            {timeline.isSuccess && timeline.data.length === 0 && <p>No hay planes guardados todavía.</p>}
            {timeline.isSuccess && timeline.data.length > 0 && <div className="recovery-timeline">{timeline.data.map((record) => <article key={record.id}><span /><strong>{record.trigger} · {record.moment}</strong><p>Necesitabas {record.need.toLowerCase()}. Entonces {record.alternative}.</p><time dateTime={record.recordedAt}>{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(record.recordedAt))}</time></article>)}</div>}
          </article>
        </aside>
      </div>
    </section>
  );
}
