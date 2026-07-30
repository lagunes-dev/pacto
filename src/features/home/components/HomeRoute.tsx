import { Link } from "react-router";

import { SessionActions } from "../../auth/components/AuthRoute";
import { DailyCheckinCard } from "../../checkin/components/DailyCheckinCard";
import { usePersonalProgress } from "../../progress/queries";

function message(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos consultar el servicio.";
}

export function HomeRoute() {
  const progress = usePersonalProgress();

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
            <h2>Sin un plan guardado</h2>
            <p>Los planes de recuperación se habilitarán en una entrega posterior. Este espacio no guarda respuestas todavía.</p>
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
