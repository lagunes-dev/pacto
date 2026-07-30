function isAppleMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  const appleNavigator = navigator as Navigator & { standalone?: boolean };
  return appleNavigator.standalone === true
    || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function InstallGuidance() {
  if (isStandalone()) {
    return <span className="status-chip">App instalada</span>;
  }

  const guidance = isAppleMobileDevice()
    ? "En Safari, abrí Compartir y elegí Agregar a inicio."
    : "Usá la opción Instalar de tu navegador cuando esté disponible.";

  return (
    <details className="install-guidance">
      <summary>Instalar</summary>
      <p className="install-guidance-card">{guidance}</p>
    </details>
  );
}
