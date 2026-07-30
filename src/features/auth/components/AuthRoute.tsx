import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

import { authCredentialsSchema, type AuthCredentials } from "../model";
import { useAuth } from "../queries/AuthProvider";

export function AuthRoute({ mode }: { mode: "login" | "register" }) {
  const { session, isResolving, sessionError, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState<AuthCredentials>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof AuthCredentials | "form", string>>>({});
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const isRegister = mode === "register";

  if (isResolving) return <p role="status">Comprobando sesión…</p>;
  if (session) return <Navigate to="/progress" replace />;
  if (sessionError) return <p className="field-error" role="alert">Autenticación no disponible: {sessionError}</p>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = authCredentialsSchema.safeParse(values);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({ email: fields.email?.[0], password: fields.password?.[0] });
      return;
    }
    setErrors({});
    try {
      if (isRegister) {
        const result = await register(parsed.data);
        if (result.status === "confirmation-required") {
          setConfirmationEmail(result.email);
          return;
        }
      } else {
        await login(parsed.data);
      }
      const destination = (location.state as { from?: string } | null)?.from ?? "/progress";
      navigate(destination, { replace: true });
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "No se pudo completar el acceso." });
    }
  }

  return (
    <section className="route-card auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">Espacio personal</p>
      <h1 id="auth-title">{isRegister ? "Crea tu cuenta privada." : "Vuelve a tus decisiones."}</h1>
      <p className="route-lead">Tus hábitos y tu progreso pertenecen únicamente a tu sesión.</p>
      <div className="notice" role="status">La persistencia depende del adaptador configurado. El fixture funciona únicamente en desarrollo.</div>
      {confirmationEmail && <div className="notice" role="status">Revisa {confirmationEmail} para confirmar tu cuenta antes de iniciar sesión.</div>}
      <form className="auth-form" onSubmit={submit} noValidate>
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" autoComplete="email" value={values.email} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} onChange={(e) => setValues({ ...values, email: e.target.value })} />
        {errors.email && <span id="email-error" className="field-error">{errors.email}</span>}
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} value={values.password} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined} onChange={(e) => setValues({ ...values, password: e.target.value })} />
        {errors.password && <span id="password-error" className="field-error">{errors.password}</span>}
        {errors.form && <p className="field-error" role="alert">{errors.form}</p>}
        <button className="primary-button" type="submit">{isRegister ? "Registrarme" : "Iniciar sesión"}</button>
      </form>
      <button className="text-button" type="button" onClick={() => navigate(isRegister ? "/sign-in" : "/register")}>{isRegister ? "Ya tengo una cuenta" : "Crear una cuenta"}</button>
    </section>
  );
}

export function SessionActions() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  if (!session) return null;
  return <button className="text-button" type="button" onClick={async () => { await logout(); navigate("/sign-in", { replace: true }); }}>Cerrar sesión</button>;
}
