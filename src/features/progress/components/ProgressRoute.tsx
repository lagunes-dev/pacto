import { Link } from "react-router";

import { SessionActions } from "../../auth/components/AuthRoute";
import { emptyProgressEvidence, MINIMUM_INSIGHT_EVENTS } from "../../insights/model";
import { usePersonalProgress } from "../queries";

function message(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos consultar el servicio.";
}

export function ProgressRoute() {
  const progress = usePersonalProgress();
  const evidence = progress.data?.evidence ?? emptyProgressEvidence();
  const personal = evidence.personal;
  const hasActivity = Boolean(progress.data && (
    progress.data.habits.length || progress.data.completedEntryCount || personal.eventCount
  ));

  return (
    <section className="route-card progress-route" aria-labelledby="progress-title">
      <div className="route-heading">
        <div className="progress-heading-copy"><p className="eyebrow">Aprendizajes personales</p><h1 id="progress-title">Datos que sugieren una acción</h1><p>No hay calificaciones generales ni comparación con tu pareja.</p></div>
        <Link className="primary-button progress-manage-action" to="/habits/new">Administrar hábitos</Link>
      </div>

      {progress.isPending && <p role="status">Cargando tu progreso…</p>}
      {progress.isError && (
        <div className="service-alert" role="alert">
          <strong>Tu progreso no está disponible.</strong>
          <span>{message(progress.error)} No mostramos datos sin confirmar.</span>
          <button type="button" className="text-button" onClick={() => progress.refetch()}>Reintentar</button>
        </div>
      )}
      {progress.isSuccess && !hasActivity && (
        <div className="progress-empty"><h2>Tu historia empieza con un hábito</h2><p>No hay actividad persistida ni métricas para mostrar todavía.</p></div>
      )}
      {progress.isSuccess && hasActivity && (
        <>
          {progress.data.habits.length > 0 && <section className="today-decision" aria-labelledby="today-title">
            <p className="eyebrow">Hoy</p>
            <h2 id="today-title">Siguiente decisión</h2>
            <p>Enfócate en <strong>{[...progress.data.habits].sort((a, b) => b.priority - a.priority)[0].name}</strong>.</p>
            <span className="today-note">Esto es una sugerencia basada en tu prioridad; todavía no registra un check-in.</span>
          </section>}
          <div className="progress-grid" aria-label="Resumen de progreso">
            <article><strong>{personal.executedPlanCount}</strong><span>Planes registrados como ejecutados</span></article>
            <article><strong>{personal.supportRespondedCount}/{personal.supportRequestedCount}</strong><span>Solicitudes de apoyo respondidas</span></article>
            <article><strong>{progress.data.activeDayCount}</strong><span>Días con actividad</span></article>
          </div>

          <section className="insights-section" aria-labelledby="insights-title">
            <div className="section-heading"><div><p className="eyebrow">Patrones personales</p><h2 id="insights-title">Qué muestran tus registros</h2></div></div>
            {personal.eventCount < MINIMUM_INSIGHT_EVENTS ? (
              <div className="progress-empty">
                <h3>Aún no hay evidencia suficiente</h3>
                <p>{personal.eventCount === 2 ? "Falta un registro para identificar patrones." : `Se necesitan al menos ${MINIMUM_INSIGHT_EVENTS} eventos para sugerir un patrón.`}</p>
              </div>
            ) : (
              <div className="insight-grid">
                <article className="insight-card">
                  <p className="eyebrow">Detonante y momento</p>
                  <h3>{personal.frequentTrigger ? `${personal.frequentTrigger.value} podría ser un detonante frecuente.` : "Todavía no se repite un detonante."}</h3>
                  <p>{personal.frequentMoment ? `${personal.frequentMoment.value} aparece en ${personal.frequentMoment.occurrences} de ${personal.eventCount} registros.` : "Los momentos registrados todavía son distintos."}</p>
                  <strong>Acción sugerida: prepara una alternativa antes de ese momento.</strong>
                </article>
                <article className="insight-card">
                  <p className="eyebrow">Alternativa observada</p>
                  <h3>{personal.effectiveAlternative ? `${personal.effectiveAlternative.value} podría ser tu alternativa más efectiva.` : "Todavía no se repite una alternativa."}</h3>
                  <p>{personal.effectiveAlternative ? `Aparece en ${personal.effectiveAlternative.occurrences} planes ejecutados; esto sugiere utilidad, no garantiza un resultado.` : "Registra qué alternativa usaste para reconocer un patrón."}</p>
                  <strong>Acción sugerida: mantenla disponible esta semana.</strong>
                </article>
              </div>
            )}
          </section>

          <section className="support-metrics" aria-labelledby="support-metrics-title">
            <p className="eyebrow">Apoyo solicitado</p><h2 id="support-metrics-title">Respuesta a tus solicitudes</h2>
            <p>{personal.averageSupportResponseMinutes === null ? "Aún no hay respuestas confirmadas para calcular un tiempo." : `Respuesta en ${personal.averageSupportResponseMinutes} min en promedio.`}</p>
          </section>

          <section className="cooperation-card" aria-label="Cooperación semanal">
            <p className="eyebrow">Meta compartida</p><h2>Cómo cooperaron esta semana</h2>
            <p>Solo suma acciones autorizadas; nunca combina porcentajes personales.</p>
            {evidence.cooperation ? <div className="cooperation-grid">
              <article><strong>{evidence.cooperation.checkinsCompleted}</strong><span>check-ins autorizados</span></article>
              <article><strong>{evidence.cooperation.supportRequestsResponded}</strong><span>solicitudes respondidas</span></article>
              <article><strong>{evidence.cooperation.reviewsCompleted}</strong><span>revisiones compartidas</span></article>
            </div> : <p>El resumen compartido no está disponible sin una relación activa y permisos vigentes.</p>}
          </section>

          {progress.data.habits.length > 0 && <section className="active-habits" aria-labelledby="active-habits-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Tu inventario personal</p>
                <h2 id="active-habits-title">Hábitos activos</h2>
              </div>
              <Link className="text-link" to="/habits/new">Agregar hábito</Link>
            </div>
            <div className="active-habits-list">
              {progress.data.habits.map((habit) => (
                <article className="active-habit-card" key={habit.id} aria-label={`Hábito ${habit.name}`}>
                  <div>
                    <h3>{habit.name}</h3>
                    <p>Prioridad {habit.priority} · {habit.active ? "Activo" : "Pausado"}</p>
                  </div>
                  <Link className="secondary-button" to="/habits/new">Administrar</Link>
                </article>
              ))}
            </div>
          </section>}
         </>
      )}
      <SessionActions />
    </section>
  );
}
