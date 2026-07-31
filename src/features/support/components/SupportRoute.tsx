import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { supportResponses, type SupportResponse } from "../model";
import { useAcknowledgeSupportRequest, useCloseSupportRequest, useSupportRequests } from "../queries";
import type { PushStatus, PushSubscriptionPort } from "../../push/port";
import { useRepositories } from "../../../app/providers";

import { messageLabels, SupportDialog, supportLabels } from "./SupportDialog";

const responseLabels: Record<SupportResponse, string> = { available_now: "Estoy disponible ahora.", available_later: "Puedo acompañarte más tarde.", here_with_you: "Estoy aquí contigo." };

const pushMessages: Record<PushStatus, string> = {
  unsupported: "Este navegador no admite notificaciones.",
  default: "Las notificaciones están desactivadas. Solo se pedirá permiso si elegís activarlas.",
  denied: "El permiso para notificaciones está bloqueado en el navegador.",
  enabled: "Las notificaciones de apoyo están activadas en este navegador.",
  unavailable: "Las notificaciones no están disponibles en este momento.",
};

export function PushSubscriptionControls({ port }: { port: PushSubscriptionPort }) {
  const [status, setStatus] = useState<PushStatus>("unavailable");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void port.status().then((next) => { if (active) setStatus(next); });
    return () => { active = false; };
  }, [port]);

  const change = async (action: "activate" | "revoke") => {
    setBusy(true);
    setStatus(await port[action]());
    setBusy(false);
  };

  return <div className="consent-form" aria-labelledby="push-title">
    <h2 id="push-title">Notificaciones de apoyo</h2>
    <p role="status" aria-live="polite">{pushMessages[status]}</p>
    {status === "default" && <button className="primary-button" disabled={busy} type="button" onClick={() => void change("activate")}>Activar notificaciones</button>}
    {status === "enabled" && <button className="text-button" disabled={busy} type="button" onClick={() => void change("revoke")}>Desactivar notificaciones</button>}
  </div>;
}

export function SupportRoute() {
  const { push } = useRepositories();
  const requests = useSupportRequests();
  const acknowledge = useAcknowledgeSupportRequest();
  const close = useCloseSupportRequest();
  const [announcement, setAnnouncement] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const error = requests.error || acknowledge.error || close.error;
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const busy = acknowledge.isPending || close.isPending;

  return <section className="route-card consent-route" aria-labelledby="support-title">
    <div className="route-heading"><div><p className="eyebrow">Sin vigilancia</p><h1 id="support-title">Apoyo explícito</h1></div><Link className="text-link" to="/partnership">Volver al vínculo</Link></div>
    <p className="route-lead">Una solicitud aparece solamente cuando alguien la crea. No genera alertas automáticas, mensajes ni notificaciones.</p>
    <p className="sr-announcement" role="status" aria-live="polite">{announcement}</p>
    {error && <div ref={errorRef} tabIndex={-1} className="service-alert" role="alert">La solicitud no está disponible.</div>}
    {requests.isPending && <p role="status">Cargando solicitudes…</p>}
    <PushSubscriptionControls port={push} />
    {requests.data && <><div className="consent-form"><SupportDialog onSent={() => setAnnouncement("Solicitud enviada. Tu pareja verá sólo la opción elegida.")} /></div><ul className="support-list">{requests.data.map((request) => <li key={request.id}><div><strong>{supportLabels[request.type].title}</strong><span>{request.requestedBy === "me" ? "Solicitada por ti" : "Solicitada por tu vínculo"} · {request.status}</span>{request.message && <small>{messageLabels[request.message]}</small>}{request.response && <small>{responseLabels[request.response]}</small>}</div>{request.requestedBy === "partner" && request.status === "pending" && <form onSubmit={(event) => { event.preventDefault(); const response = new FormData(event.currentTarget).get("response") as SupportResponse; acknowledge.mutate({ id: request.id, response }, { onSuccess: () => setAnnouncement("Respuesta enviada.") }); }}><label htmlFor={`response-${request.id}`}>Respuesta para {supportLabels[request.type].title}</label><select id={`response-${request.id}`} name="response">{supportResponses.map((response) => <option key={response} value={response}>{responseLabels[response]}</option>)}</select><button className="text-button" disabled={busy} type="submit">Responder</button></form>}{request.requestedBy === "partner" && request.status === "acknowledged" && <button className="text-button" disabled={busy} onClick={() => close.mutate(request.id, { onSuccess: () => setAnnouncement("Solicitud cerrada.") })}>Cerrar</button>}</li>)}</ul></>}
  </section>;
}
