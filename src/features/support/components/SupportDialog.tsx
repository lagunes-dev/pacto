import { useRef, useState } from "react";

import { Modal } from "../../../shared/ui/Modal";
import { supportMessages, supportTypes, type SupportMessage, type SupportType } from "../model";
import { useCreateSupportRequest } from "../queries";

export const supportLabels: Record<SupportType, { title: string; description: string }> = {
  distraction: { title: "Distráeme unos minutos", description: "Una conversación breve, sin hablar de comida." },
  food_choice: { title: "Ayúdame a elegir qué comer", description: "Opciones prácticas, sin compartir detalles de comida." },
  motivation: { title: "Recuérdame mi motivo", description: "Un mensaje corto, sin revelar tu motivo personal." },
  conversation: { title: "Háblame cuando puedas", description: "No es urgente; sólo quiero compañía." },
  presence_no_advice: { title: "Solo acompáñame, sin consejos", description: "Escúchame sin intentar resolverlo." },
};

export const messageLabels: Record<SupportMessage, string> = {
  not_urgent: "No es urgente.",
  when_available: "Cuando tengas oportunidad.",
  no_reply_needed: "No necesito una respuesta inmediata.",
};

type Props = { buttonLabel?: string; onSent?: () => void };

export function SupportDialog({ buttonLabel = "Crear solicitud", onSent }: Props) {
  const create = useCreateSupportRequest();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<SupportType>(supportTypes[0]);
  const [message, setMessage] = useState<SupportMessage | "">("");
  const [localError, setLocalError] = useState("");

  const close = () => setOpen(false);
  return <>
    <button ref={triggerRef} className="primary-button" type="button" onClick={() => { setLocalError(""); setOpen(true); }}>{buttonLabel}</button>
    <Modal open={open} onOpenChange={setOpen} titleId="support-dialog-title" descriptionId="support-dialog-description" triggerRef={triggerRef}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!navigator.onLine) { setLocalError("Necesitas conexión para enviar apoyo. No se guardó ni se puso en espera."); return; }
        create.mutate({ type: choice, ...(message ? { message } : {}) }, { onSuccess: () => { close(); onSent?.(); } });
      }}>
        <div className="modal-head"><div><h2 id="support-dialog-title">¿Qué necesitas ahora?</h2><p id="support-dialog-description">Tu pareja recibirá sólo esta elección y, si la agregas, una frase predefinida.</p></div><button type="button" className="icon-button" aria-label="Cerrar solicitud" onClick={close}>×</button></div>
        <div className="modal-body">
          <div className="intervention-options" role="radiogroup" aria-label="Opciones de apoyo">
            {supportTypes.map((type) => <label key={type} className={`intervention-option${choice === type ? " is-selected" : ""}`}><input type="radio" name="support-choice" value={type} checked={choice === type} onChange={() => setChoice(type)} /><span><strong>{supportLabels[type].title}</strong><small>{supportLabels[type].description}</small></span></label>)}
          </div>
          <label htmlFor="support-message">Mensaje opcional</label>
          <select id="support-message" value={message} onChange={(event) => setMessage(event.target.value as SupportMessage | "")}><option value="">Sin mensaje adicional</option>{supportMessages.map((item) => <option key={item} value={item}>{messageLabels[item]}</option>)}</select>
          <p>Las notas privadas, el nivel de antojo y los detalles de comida no se incluyen.</p>
          {(localError || create.error) && <p role="alert">{localError || "No pudimos enviar la solicitud."}</p>}
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Cancelar</button><button type="submit" className="primary-button" disabled={create.isPending}>Enviar solicitud</button></div>
      </form>
    </Modal>
  </>;
}
