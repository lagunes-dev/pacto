import { Link } from "react-router";

export function RegisterRoute() {
  return (
    <section className="route-card register-route" aria-labelledby="register-view-title">
      <p className="eyebrow">Registro y recuperación</p>
      <h1 id="register-view-title">Entender, corregir, continuar.</h1>
      <p className="route-lead">Un evento no define tu día. El registro detallado, las notas privadas y los planes “si–entonces” se habilitarán en una entrega posterior.</p>
      <div className="notice" role="status">
        <strong>Sin guardado en esta vista.</strong> No hay check-in, recuperación ni nota pendiente de envío.
      </div>
      <div className="register-actions">
        <Link className="primary-button" to="/habits/new">Administrar hábitos personales</Link>
        <Link className="secondary-button" to="/inicio">Volver a Inicio</Link>
      </div>
    </section>
  );
}
