import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { useMyPreferences, useUpdateMyPreferences } from "../queries";

export function PreferencesRoute() {
  const preferences = useMyPreferences();
  const update = useUpdateMyPreferences();
  const [announcement, setAnnouncement] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (preferences.isError || update.isError) errorRef.current?.focus(); }, [preferences.isError, update.isError]);

  return <section className="route-card consent-route" aria-labelledby="preferences-title">
    <div className="route-heading"><div><p className="eyebrow">Decisiones propias</p><h1 id="preferences-title">Mis preferencias</h1></div><Link className="text-link" to="/partnership">Volver al vínculo</Link></div>
    <p className="route-lead">Estas opciones pertenecen solamente a tu cuenta y no afirman que exista contenido compartido.</p>
    <p className="sr-announcement" role="status" aria-live="polite">{announcement}</p>
    {preferences.isPending && <p role="status">Cargando tus preferencias…</p>}
    {(preferences.isError || update.isError) && <div ref={errorRef} tabIndex={-1} className="service-alert" role="alert">Tus preferencias no están disponibles.</div>}
    {preferences.data && <form className="consent-panel" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      update.mutate({ shareProgress: data.has("shareProgress"), allowSupportRequests: data.has("allowSupportRequests") }, { onSuccess: () => setAnnouncement("Tus preferencias fueron actualizadas.") });
    }}>
      <label className="choice"><input name="shareProgress" type="checkbox" defaultChecked={preferences.data.shareProgress} /> Permitir una futura vista de progreso, cuando exista y la apruebes</label>
      <label className="choice"><input name="allowSupportRequests" type="checkbox" defaultChecked={preferences.data.allowSupportRequests} /> Permitir solicitudes explícitas de apoyo</label>
      <button className="primary-button" disabled={update.isPending} type="submit">Guardar mis preferencias</button>
    </form>}
  </section>;
}
