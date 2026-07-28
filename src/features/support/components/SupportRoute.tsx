import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { supportTypes, type SupportType } from "../model";
import { useAcknowledgeSupportRequest, useCloseSupportRequest, useCreateSupportRequest, useSupportRequests } from "../queries";

const labels: Record<SupportType, string> = { encouragement: "Aliento", check_in: "Conversar", practical_help: "Ayuda práctica" };

export function SupportRoute() {
  const requests = useSupportRequests();
  const create = useCreateSupportRequest();
  const acknowledge = useAcknowledgeSupportRequest();
  const close = useCloseSupportRequest();
  const [announcement, setAnnouncement] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const error = requests.error || create.error || acknowledge.error || close.error;
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const busy = create.isPending || acknowledge.isPending || close.isPending;

  return <section className="route-card consent-route" aria-labelledby="support-title">
    <div className="route-heading"><div><p className="eyebrow">Sin vigilancia</p><h1 id="support-title">Apoyo explícito</h1></div><Link className="text-link" to="/partnership">Volver al vínculo</Link></div>
    <p className="route-lead">Una solicitud aparece solamente cuando alguien la crea. No genera alertas automáticas, mensajes ni notificaciones.</p>
    <p className="sr-announcement" role="status" aria-live="polite">{announcement}</p>
    {error && <div ref={errorRef} tabIndex={-1} className="service-alert" role="alert">La solicitud no está disponible.</div>}
    {requests.isPending && <p role="status">Cargando solicitudes…</p>}
    {requests.data && <><form className="consent-form" onSubmit={(event) => { event.preventDefault(); const type = new FormData(event.currentTarget).get("type") as SupportType; create.mutate(type, { onSuccess: () => setAnnouncement("Solicitud de apoyo creada.") }); }}>
      <label htmlFor="support-type">Tipo de apoyo</label><select id="support-type" name="type">{supportTypes.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select>
      <button className="primary-button" disabled={busy} type="submit">Solicitar apoyo</button>
    </form><ul className="support-list">{requests.data.map((request) => <li key={request.id}><div><strong>{labels[request.type]}</strong><span>{request.requestedBy === "me" ? "Solicitada por vos" : "Solicitada por tu vínculo"} · {request.status}</span></div>{request.requestedBy === "partner" && request.status === "pending" && <button className="text-button" disabled={busy} onClick={() => acknowledge.mutate(request.id, { onSuccess: () => setAnnouncement("Solicitud reconocida.") })}>Reconocer</button>}{request.requestedBy === "partner" && request.status === "acknowledged" && <button className="text-button" disabled={busy} onClick={() => close.mutate(request.id, { onSuccess: () => setAnnouncement("Solicitud cerrada.") })}>Cerrar</button>}</li>)}</ul></>}
  </section>;
}
