import { Link } from "react-router";

import { SessionActions } from "../../auth/components/AuthRoute";
import { DailyCheckinCard } from "../../checkin/components/DailyCheckinCard";
import { usePersonalProgress } from "../../progress/queries";
import { useRecoveryTimeline } from "../../recovery/queries";

function message(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos consultar el servicio.";
}

export function HomeRoute() {
  const progress = usePersonalProgress();
  const plans = useRecoveryTimeline();
  const currentPlan = plans.data?.[0];

  return (
    <section className="home-route" aria-labelledby="home-title">
      <header className="home-hero">
        <p className="eyebrow">Objetivo personal</p>
        <h1 id="home-title">La próxima decisión sí cuenta.</h1>
        <p className="route-lead">Pacto te ayuda a elegir con autonomía. Tu información personal permanece privada y nada se comparte sin autorización.</p>
      </header>

      {progress.isPending && <p role="status">Cargando tu espacio personal…</p>}
      {progress.isError && (
        <div className="service-alert" role="alert">
          <strong>Tu resumen no está disponible.</strong>
          <span>{message(progress.error)} No mostramos datos sin confirmar.</span>
          <button type="button" className="text-button" onClick={() => progress.refetch()}>Reintentar</button>
        </div>
      )}

      <div className="home-dashboard">
        <div className="home-stack">
          <article className="home-panel home-plan">
            <p className="eyebrow">Plan para hoy</p>
            {plans.isPending && <p role="status">Cargando tu plan…</p>}
            {plans.isError && <div className="service-alert" role="alert"><strong>Tu plan no está disponible.</strong><span>{message(plans.error)} No mostramos datos sin confirmar.</span><button type="button" className="text-button" onClick={() => plans.refetch()}>Reintentar</button></div>}
            {plans.isSuccess && !currentPlan && <><h2>Sin un plan guardado</h2><p>Registra una situación para preparar una alternativa concreta.</p><Link className="text-link" to="/registro">Crear un plan</Link></>}
            {plans.isSuccess && currentPlan && <><h2>{currentPlan.moment}</h2><p>Si vuelve el {currentPlan.trigger.toLowerCase()}, entonces {currentPlan.alternative}.</p><Link className="text-link" to="/registro">Ver registro</Link></>}
          </article>

          <DailyCheckinCard />

          <div className="progress-grid" aria-label="Métricas personales confirmadas">
            <article><strong>{progress.isSuccess ? progress.data.habits.length : "—"}</strong><span>Hábitos personales</span></article>
            <article><strong>{progress.isSuccess ? progress.data.completedEntryCount : "—"}</strong><span>Registros confirmados</span></article>
            <article><strong>{progress.isSuccess ? progress.data.activeDayCount : "—"}</strong><span>Días con actividad</span></article>
          </div>
        </div>

        <aside className="home-stack" aria-label="Acompañamiento y revisión">
          <article className="home-panel">
            <p className="eyebrow">Apoyo</p>
            <h2>Elige qué necesitas</h2>
            <p>Las solicitudes de apoyo desde Inicio estarán disponibles más adelante. No se envió ninguna solicitud.</p>
          </article>
          <article className="home-panel">
            <p className="eyebrow">Acompañamiento</p>
            <h2>Sin estado de pareja mostrado</h2>
            <p>No mostramos identidad, disponibilidad ni actividad de otra persona sin datos autorizados.</p>
            <Link className="text-link" to="/acuerdo">Revisar vínculo y consentimiento</Link>
          </article>
          <article className="home-panel">
            <p className="eyebrow">Revisión semanal</p>
            <h2>Aún no configurada</h2>
            <p>La cooperación semanal y sus métricas llegarán en otra entrega; no calculamos datos de pareja.</p>
          </article>
        </aside>
      </div>
      <SessionActions />
    </section>
  );
}
