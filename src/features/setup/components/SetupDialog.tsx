import type { RefObject } from "react";

import { Modal } from "../../../shared/ui/Modal";

export function SetupDialog({ open, onOpenChange, triggerRef }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} titleId="setup-title" descriptionId="setup-description" triggerRef={triggerRef}>
      <div className="modal-head">
        <div>
          <h2 id="setup-title">Configura tu Pacto</h2>
          <p id="setup-description">La vinculación y cada permiso requieren consentimiento individual.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Cerrar configuración" onClick={() => onOpenChange(false)}>×</button>
      </div>
      <div className="modal-body">
        <div className="stepper">
          <div className="step active"><span className="step-num">1</span><div><strong>Objetivo personal</strong><p>Define tu objetivo cuando esta función esté disponible.</p></div></div>
          <div className="step"><span className="step-num">2</span><div><strong>Vinculación consensuada</strong><p>No hay una invitación ni una conexión activa desde este diálogo.</p></div></div>
          <div className="step"><span className="step-num">3</span><div><strong>Permisos separados</strong><p>Cada persona decidirá qué comparte. Nadie podrá editar las preferencias de otra persona.</p></div></div>
        </div>
        <p className="notice"><strong>Disponible próximamente:</strong> esta pantalla explica el proceso, pero todavía no guarda cambios ni vincula cuentas.</p>
      </div>
      <div className="modal-actions">
        <button className="secondary-button" type="button" onClick={() => onOpenChange(false)}>Cerrar</button>
      </div>
    </Modal>
  );
}
