import { Link } from "react-router";

import { SessionActions } from "../../auth/components/AuthRoute";
import { usePersonalProgress } from "../queries";

function message(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos consultar el servicio.";
}

export function ProgressRoute() {
  const progress = usePersonalProgress();

  return (
    <section className="route-card progress-route" aria-labelledby="progress-title">
      <div className="route-heading">
        <div className="progress-heading-copy"><p className="eyebrow">Resumen privado</p><h1 id="progress-title">Tu progreso personal</h1></div>
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
      {progress.isSuccess && progress.data.habits.length === 0 && (
        <div className="progress-empty"><h2>Tu historia empieza con un hábito</h2><p>No hay actividad persistida ni métricas para mostrar todavía.</p></div>
      )}
      {progress.isSuccess && progress.data.habits.length > 0 && (
        <>
          <section className="today-decision" aria-labelledby="today-title">
            <p className="eyebrow">Hoy</p>
            <h2 id="today-title">Siguiente decisión</h2>
            <p>Enfócate en <strong>{[...progress.data.habits].sort((a, b) => b.priority - a.priority)[0].name}</strong>.</p>
            <span className="today-note">Esto es una sugerencia basada en tu prioridad; todavía no registra un check-in.</span>
          </section>
          <div className="progress-grid" aria-label="Resumen de progreso">
            <article><strong>{progress.data.habits.length}</strong><span>Hábitos personales</span></article>
            <article><strong>{progress.data.completedEntryCount}</strong><span>Registros completados</span></article>
            <article><strong>{progress.data.activeDayCount}</strong><span>Días con actividad</span></article>
          </div>
          <section className="active-habits" aria-labelledby="active-habits-title">
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
          </section>
         </>
      )}
      <SessionActions />
    </section>
  );
}
