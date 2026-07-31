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
      update.mutate({
        shareCheckinCompleted: data.has("shareCheckinCompleted"),
        shareGeneralStatus: data.has("shareGeneralStatus"),
        shareHabitDetails: data.has("shareHabitDetails"),
        shareCravingLevel: data.has("shareCravingLevel"),
        sharePercentages: data.has("sharePercentages"),
        noThreats: data.has("noThreats"),
        askBeforeAdvice: data.has("askBeforeAdvice"),
        noComparisons: data.has("noComparisons"),
        pauseAllowed: data.has("pauseAllowed"),
        preferredSupport: String(data.get("preferredSupport") ?? ""),
      }, { onSuccess: () => setAnnouncement("Tus preferencias fueron actualizadas.") });
    }}>
      <fieldset><legend>Lo que decides compartir</legend>
        <label className="choice"><input name="shareCheckinCompleted" type="checkbox" defaultChecked={preferences.data.shareCheckinCompleted} /> Confirmación de check-in completado</label>
        <label className="choice"><input name="shareGeneralStatus" type="checkbox" defaultChecked={preferences.data.shareGeneralStatus} /> Estado general</label>
        <label className="choice"><input name="shareHabitDetails" type="checkbox" defaultChecked={preferences.data.shareHabitDetails} /> Detalles de hábitos</label>
        <label className="choice"><input name="shareCravingLevel" type="checkbox" defaultChecked={preferences.data.shareCravingLevel} /> Nivel de antojo</label>
        <label className="choice"><input name="sharePercentages" type="checkbox" defaultChecked={preferences.data.sharePercentages} /> Porcentajes personales</label>
      </fieldset>
      <fieldset><legend>Límites de comunicación</legend>
        <label className="choice"><input name="noThreats" type="checkbox" defaultChecked={preferences.data.noThreats} /> Sin amenazas ni ultimátums</label>
        <label className="choice"><input name="askBeforeAdvice" type="checkbox" defaultChecked={preferences.data.askBeforeAdvice} /> Preguntar antes de dar consejos</label>
        <label className="choice"><input name="noComparisons" type="checkbox" defaultChecked={preferences.data.noComparisons} /> Sin comparaciones</label>
        <label className="choice"><input name="pauseAllowed" type="checkbox" defaultChecked={preferences.data.pauseAllowed} /> Respetar una pausa solicitada</label>
      </fieldset>
      <label htmlFor="preferred-support">Apoyo preferido</label>
      <textarea id="preferred-support" name="preferredSupport" required maxLength={160} defaultValue={preferences.data.preferredSupport} />
      <button className="primary-button" disabled={update.isPending} type="submit">Guardar mis preferencias</button>
    </form>}
  </section>;
}
