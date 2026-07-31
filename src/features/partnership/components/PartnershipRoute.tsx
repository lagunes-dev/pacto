import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import {
  useAcceptInvite,
  useCancelInvite,
  useCreateInvite,
  useEndPartnership,
  useMyPartnership,
  usePausePartnership,
  useRequestPartnershipResume,
  useConfirmPartnershipResume,
  useRejectInvite,
} from "../queries";

const neutralError = "La solicitud no está disponible. Revisa los datos o intenta nuevamente.";

export function PartnershipRoute() {
  const partnership = useMyPartnership();
  const createInvite = useCreateInvite();
  const acceptInvite = useAcceptInvite();
  const rejectInvite = useRejectInvite();
  const cancelInvite = useCancelInvite();
  const pause = usePausePartnership();
  const requestResume = useRequestPartnershipResume();
  const confirmResume = useConfirmPartnershipResume();
  const end = useEndPartnership();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const mutations = [createInvite, acceptInvite, rejectInvite, cancelInvite, pause, requestResume, confirmResume, end];
  const error = partnership.error ?? mutations.find((item) => item.isError)?.error;

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const announce = (message: string) => { setAnnouncement(message); setCode(""); };

  if (partnership.isPending) return <p role="status">Cargando tu vínculo…</p>;
  if (partnership.isError) return <div ref={errorRef} tabIndex={-1} className="service-alert" role="alert">{neutralError}</div>;
  const current = partnership.data;
  const busy = mutations.some((item) => item.isPending);

  return (
    <section className="route-card consent-route" aria-labelledby="partnership-title">
      <div><p className="eyebrow">Consentimiento explícito</p><h1 id="partnership-title">Vínculo de apoyo</h1></div>
      <p className="route-lead">Cada persona decide si acepta, pausa o finaliza el vínculo. Nada se comparte automáticamente.</p>
      <p className="sr-announcement" role="status" aria-live="polite">{announcement}</p>
       {createdCode && <div className="notice"><strong>Código de invitación: {createdCode}</strong><br />Compártelo directamente con la persona invitada antes de su vencimiento.</div>}
      {error && <div ref={errorRef} tabIndex={-1} className="service-alert" role="alert">{neutralError}</div>}

      {!current && (
        <div className="consent-grid">
          <form className="consent-panel" onSubmit={(event) => {
            event.preventDefault();
            createInvite.mutate(email, { onSuccess: (invite) => { setCreatedCode(invite.code); announce("Invitación creada."); } });
          }}>
            <h2>Invitar a una persona</h2>
            <label htmlFor="invite-email">Correo de la persona invitada</label>
            <input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <button className="primary-button" disabled={busy} type="submit">Crear invitación</button>
          </form>
          <RedeemForm code={code} setCode={setCode} busy={busy} onAccept={() => acceptInvite.mutate(code, { onSuccess: () => announce("Invitación aceptada.") })} onReject={() => rejectInvite.mutate(code, { onSuccess: () => announce("Invitación rechazada.") })} />
        </div>
      )}

      {current?.status === "pending" && (
        <div className="consent-panel">
          <h2>Invitación pendiente</h2><p>La activación requiere el código exacto y una decisión explícita.</p>
          <RedeemForm code={code} setCode={setCode} busy={busy} onAccept={() => acceptInvite.mutate(code, { onSuccess: () => announce("Invitación aceptada.") })} onReject={() => rejectInvite.mutate(code, { onSuccess: () => announce("Invitación rechazada.") })} />
          <button className="danger-button" disabled={busy} type="button" onClick={() => cancelInvite.mutate(undefined, { onSuccess: () => announce("Invitación cancelada.") })}>Cancelar mi invitación</button>
        </div>
      )}

      {current && current.status !== "pending" && (
        <div className="consent-panel">
          <span className="status-chip">{statusLabel[current.status]}</span>
          <h2>{current.partner.displayName}</h2>
          {current.status === "active" && <><p>El apoyo está habilitado solamente mediante acciones explícitas.</p><div className="form-actions"><Link className="primary-button" to="/partnership/support">Solicitudes de apoyo</Link><Link className="text-link" to="/partnership/preferences">Mis preferencias</Link></div></>}
           {current.status === "paused" && <><p>El acceso de apoyo está revocado. Tus preferencias y tu historial privado siguen siendo tuyos.</p><Link className="text-link" to="/partnership/preferences">Mis preferencias</Link>
             {(!current.resumeStatus || current.resumeStatus === "none") && <button className="primary-button" disabled={busy} type="button" onClick={() => requestResume.mutate(undefined, { onSuccess: () => announce("Solicitud de reactivación enviada. El vínculo sigue pausado hasta la otra confirmación.") })}>Solicitar reactivación</button>}
             {current.resumeStatus === "requested-by-me" && <p className="notice">Tu confirmación está registrada. El vínculo sigue pausado hasta que la otra persona confirme.</p>}
             {current.resumeStatus === "awaiting-my-confirmation" && <button className="primary-button" disabled={busy} type="button" onClick={() => window.confirm("¿Reactivar el vínculo y volver a habilitar solamente los permisos actuales?") && confirmResume.mutate(undefined, { onSuccess: () => announce("Vínculo reactivado con ambas confirmaciones.") })}>Confirmar reactivación</button>}
           </>}
          {current.status === "ended" && <p>Este vínculo terminó y no puede reactivarse desde esta versión.</p>}
          {current.status === "active" && <button className="danger-button" disabled={busy} type="button" onClick={() => window.confirm("¿Pausar el vínculo y revocar el acceso de apoyo ahora?") && pause.mutate(undefined, { onSuccess: () => announce("Vínculo pausado. El acceso de apoyo fue revocado.") })}>Pausar vínculo</button>}
          {current.status !== "ended" && <button className="danger-button" disabled={busy} type="button" onClick={() => window.confirm("¿Finalizar el vínculo de forma irreversible?") && end.mutate(undefined, { onSuccess: () => announce("Vínculo finalizado. El acceso fue revocado.") })}>Finalizar vínculo</button>}
        </div>
      )}
    </section>
  );
}

const statusLabel = { active: "Activo", paused: "Pausado", ended: "Finalizado" } as const;

function RedeemForm({ code, setCode, busy, onAccept, onReject }: { code: string; setCode(value: string): void; busy: boolean; onAccept(): void; onReject(): void }) {
  return <form className="consent-form" onSubmit={(event) => { event.preventDefault(); onAccept(); }}><label htmlFor="invite-code">Código de invitación</label><input id="invite-code" required value={code} onChange={(event) => setCode(event.target.value)} /><div className="invite-actions"><button className="primary-button" disabled={busy} type="submit">Aceptar invitación</button><button className="danger-button" disabled={busy || !code} type="button" onClick={onReject}>Rechazar invitación</button></div></form>;
}
