import { useState, type RefObject } from "react";
import { Link } from "react-router";

import { useCompleteSetup, useMyPreferences } from "../../preferences/queries";
import { Modal } from "../../../shared/ui/Modal";

export function SetupDialog({ open, onOpenChange, triggerRef }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
}) {
  const preferences = useMyPreferences();
  const completeSetup = useCompleteSetup();
  const [message, setMessage] = useState("");
  const busy = completeSetup.isPending;

  return <Modal open={open} onOpenChange={onOpenChange} titleId="setup-title" descriptionId="setup-description" triggerRef={triggerRef}>
    <div className="modal-head"><div><h2 id="setup-title">Configura tu Pacto</h2><p id="setup-description">Tus decisiones se guardan en tu cuenta. Este diálogo nunca crea un vínculo automáticamente.</p></div><button className="icon-button" type="button" aria-label="Cerrar configuración" onClick={() => onOpenChange(false)}>×</button></div>
    <div className="modal-body">
      {preferences.isPending && <p role="status">Cargando tus opciones…</p>}
      {(preferences.isError || completeSetup.isError) && <p className="service-alert" role="alert">No fue posible guardar la configuración. No se creó ningún vínculo.</p>}
      <p role="status" aria-live="polite">{message}</p>
      {preferences.data && <form className="consent-panel" onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          await completeSetup.mutateAsync({
            timezone: String(data.get("timezone")),
            goal: String(data.get("goal")),
            shareCheckinCompleted: data.has("shareCheckinCompleted"), shareGeneralStatus: data.has("shareGeneralStatus"),
            shareHabitDetails: data.has("shareHabitDetails"), shareCravingLevel: data.has("shareCravingLevel"), sharePercentages: data.has("sharePercentages"),
            noThreats: data.has("noThreats"), askBeforeAdvice: data.has("askBeforeAdvice"), noComparisons: data.has("noComparisons"), pauseAllowed: data.has("pauseAllowed"),
            preferredSupport: String(data.get("preferredSupport")),
          });
          setMessage("Configuración guardada. No se creó ningún vínculo.");
        } catch { setMessage(""); }
      }}>
        <label htmlFor="setup-timezone">Zona horaria</label><input id="setup-timezone" name="timezone" required defaultValue={preferences.data.timezone} />
        <label htmlFor="setup-goal">Objetivo personal</label><input id="setup-goal" name="goal" required maxLength={80} />
        <fieldset><legend>Permisos para compartir</legend>
          <Choice name="shareCheckinCompleted" label="Check-in completado" /> <Choice name="shareGeneralStatus" label="Estado general" /> <Choice name="shareHabitDetails" label="Detalles de hábitos" /> <Choice name="shareCravingLevel" label="Nivel de antojo" /> <Choice name="sharePercentages" label="Porcentajes personales" />
        </fieldset>
        <fieldset><legend>Límites de comunicación</legend>
          <Choice name="noThreats" label="Sin amenazas ni ultimátums" /> <Choice name="askBeforeAdvice" label="Preguntar antes de dar consejos" /> <Choice name="noComparisons" label="Sin comparaciones" /> <Choice name="pauseAllowed" label="Respetar una pausa solicitada" />
        </fieldset>
        <label htmlFor="setup-support">Apoyo preferido</label><textarea id="setup-support" name="preferredSupport" required maxLength={160} defaultValue={preferences.data.preferredSupport} />
        <label className="choice"><input name="explicitConsent" type="checkbox" required /> Confirmo que estas son mis decisiones y entiendo que no vinculan otra cuenta.</label>
        <button className="primary-button" disabled={busy} type="submit">Guardar mis decisiones</button>
      </form>}
      <p className="notice">Para vincular a otra persona, ve a <Link to="/partnership" onClick={() => onOpenChange(false)}>Vínculo de apoyo</Link> y acepta o crea una invitación de forma explícita.</p>
    </div>
    <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => onOpenChange(false)}>Cerrar</button></div>
  </Modal>;
}

function Choice({ name, label }: { name: string; label: string }) {
  return <label className="choice"><input name={name} type="checkbox" /> {label}</label>;
}
