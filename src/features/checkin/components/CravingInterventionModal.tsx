import { useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "react-router";

import { Modal } from "../../../shared/ui/Modal";

const ACTIONS = [
  { id: "alternative", label: "Elegir una alternativa", description: "Revisar una opción sencilla que ya tengas disponible." },
  { id: "wait", label: "Esperar 10 minutos", description: "Tomar una pausa antes de decidir." },
  { id: "support", label: "Pedir apoyo", description: "Ir al espacio donde tú decides si envías una solicitud." },
  { id: "why", label: "Recordar por qué empecé", description: "Volver a tu motivo personal sin compartirlo." },
] as const;

type ActionId = (typeof ACTIONS)[number]["id"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
  onActionSelected: (label: string) => void;
};

export function CravingInterventionModal({ open, onOpenChange, triggerRef, onActionSelected }: Props) {
  const [selected, setSelected] = useState<ActionId>("wait");
  const [showSupportHandoff, setShowSupportHandoff] = useState(false);
  const supportCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) setShowSupportHandoff(false);
    if (open && showSupportHandoff) supportCloseRef.current?.focus();
  }, [open, showSupportHandoff]);

  const action = ACTIONS.find(({ id }) => id === selected) ?? ACTIONS[1];

  const close = () => onOpenChange(false);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      titleId={showSupportHandoff ? "support-handoff-title" : "craving-intervention-title"}
      descriptionId={showSupportHandoff ? "support-handoff-description" : "craving-intervention-description"}
      triggerRef={triggerRef}
    >
      {showSupportHandoff ? (
        <>
          <div className="modal-head">
            <div>
              <h2 id="support-handoff-title">¿Qué necesitas ahora?</h2>
              <p id="support-handoff-description">Puedes continuar al espacio de apoyo explícito y decidir ahí si envías una solicitud.</p>
            </div>
            <button ref={supportCloseRef} type="button" className="icon-button" aria-label="Cerrar apoyo" onClick={close}>×</button>
          </div>
          <div className="modal-body support-handoff">
            <strong>No se envió ninguna solicitud.</strong>
            <p>Tu nivel de antojo y los detalles de este check-in permanecen privados. Continuar tampoco envía nada automáticamente.</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setShowSupportHandoff(false)}>Volver</button>
            <Link className="primary-button" to="/partnership/support" onClick={close}>Continuar a apoyo</Link>
          </div>
        </>
      ) : (
        <>
          <div className="modal-head">
            <div>
              <h2 id="craving-intervention-title">El antojo está alto</h2>
              <p id="craving-intervention-description">No tienes que resolverlo sólo con fuerza de voluntad. Elige una acción pequeña.</p>
            </div>
            <button type="button" className="icon-button" aria-label="Cerrar intervención" onClick={close}>×</button>
          </div>
          <div className="modal-body">
            <div className="intervention-options" role="group" aria-label="Acciones para este momento">
              {ACTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`intervention-option${selected === option.id ? " is-selected" : ""}`}
                  aria-pressed={selected === option.id}
                  onClick={() => setSelected(option.id)}
                >
                  <span><strong>{option.label}</strong><small>{option.description}</small></span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={close}>Ahora no</button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (selected === "support") {
                  setShowSupportHandoff(true);
                  return;
                }
                onActionSelected(action.label);
                close();
              }}
            >Usar esta acción</button>
          </div>
        </>
      )}
    </Modal>
  );
}
