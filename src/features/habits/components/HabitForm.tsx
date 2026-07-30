import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";

import type { Habit } from "../model";
import { useCreateHabit, useDeleteHabit, useMyHabits, useUpdateHabit } from "../queries";
import { habitFormSchema, type HabitFormValues } from "../schema";

function message(error: unknown) {
  return error instanceof Error ? error.message : "No pudimos completar la acción.";
}

export function HabitForm() {
  const habitsQuery = useMyHabits();
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();
  const [editing, setEditing] = useState<Habit | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Habit | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const { register, handleSubmit, reset, setFocus, formState: { errors } } = useForm<HabitFormValues>({
    resolver: zodResolver(habitFormSchema),
    defaultValues: { name: "", priority: 2 },
  });

  const pending = createHabit.isPending || updateHabit.isPending;
  const actionError = createHabit.error ?? updateHabit.error ?? deleteHabit.error;

  const submit = handleSubmit(async (values) => {
    setAnnouncement("");
    try {
      if (editing) {
        await updateHabit.mutateAsync({ id: editing.id, input: values });
        setAnnouncement("Hábito actualizado.");
      } else {
        await createHabit.mutateAsync(values);
        setAnnouncement("Hábito creado de forma privada.");
      }
      setEditing(null);
      reset({ name: "", priority: 2 });
    } catch {
      // React Query exposes the recoverable error while RHF preserves safe values.
    }
  });

  const beginEdit = (habit: Habit) => {
    setEditing(habit);
    reset({ name: habit.name, priority: habit.priority });
    setAnnouncement(`Editando ${habit.name}.`);
    requestAnimationFrame(() => setFocus("name"));
  };

  const cancelEdit = () => {
    setEditing(null);
    reset({ name: "", priority: 2 });
    setFocus("name");
  };

  const remove = async (habit: Habit) => {
    setAnnouncement("");
    try {
      await deleteHabit.mutateAsync(habit.id);
      if (editing?.id === habit.id) cancelEdit();
      setAnnouncement(`${habit.name} fue eliminado.`);
      setPendingRemoval(null);
    } catch {
      // The inline alert remains actionable and does not claim deletion.
    }
  };

  return (
    <>
      <form className="habit-form" onSubmit={submit} noValidate aria-labelledby="habit-form-title">
        <div>
          <p className="eyebrow">Espacio privado</p>
          <h1 id="habit-form-title">{editing ? "Editar hábito" : "Crear un hábito"}</h1>
          <p className="route-lead">Solo tú puedes ver y modificar estos hábitos.</p>
        </div>

        <label htmlFor="habit-name">Nombre</label>
        <input
          id="habit-name"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "habit-name-error" : undefined}
          {...register("name")}
        />
        {errors.name && <p className="field-error" id="habit-name-error" role="alert">{errors.name.message}</p>}

        <label htmlFor="habit-priority">Prioridad</label>
        <select id="habit-priority" {...register("priority", { valueAsNumber: true })}>
          <option value="1">Baja</option>
          <option value="2">Media</option>
          <option value="3">Alta</option>
        </select>

        {actionError && <div className="service-alert" role="alert"><strong>El servicio no completó la acción.</strong><span>{message(actionError)} No se guardaron cambios; tus datos siguen en el formulario.</span></div>}
        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={pending}>{pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear hábito"}</button>
          {editing && <button className="text-button" type="button" onClick={cancelEdit}>Cancelar edición</button>}
          <Link className="text-link" to="/progress">Ver progreso</Link>
        </div>
      </form>

      <p className="sr-announcement" role="status" aria-live="polite">{announcement}</p>
      <section className="habit-list" aria-labelledby="habit-list-title">
        <h2 id="habit-list-title">Tus hábitos</h2>
        {habitsQuery.isPending && <p role="status">Cargando tus hábitos…</p>}
        {habitsQuery.isError && <div className="service-alert" role="alert"><strong>No pudimos cargar tus hábitos.</strong><span>{message(habitsQuery.error)}</span><button type="button" className="text-button" onClick={() => habitsQuery.refetch()}>Reintentar</button></div>}
        {habitsQuery.isSuccess && habitsQuery.data.length === 0 && <p className="empty-copy">Todavía no has creado hábitos. Tu primer hábito aparecerá aquí.</p>}
        {habitsQuery.data?.map((habit) => (
          <article className="habit-item" key={habit.id}>
            <div><h3>{habit.name}</h3><p>Prioridad {habit.priority}</p></div>
            <div className="habit-actions">
              <button type="button" className="text-button" onClick={() => beginEdit(habit)}>Editar <span className="visually-hidden">{habit.name}</span></button>
              <button type="button" className="danger-button" disabled={deleteHabit.isPending} onClick={() => setPendingRemoval(habit)}>Eliminar <span className="visually-hidden">{habit.name}</span></button>
            </div>
            {pendingRemoval?.id === habit.id && <div className="delete-confirmation" role="alertdialog" aria-label={`Confirmar eliminación de ${habit.name}`}><span>¿Eliminar {habit.name}? Esta acción no se puede deshacer.</span><div className="habit-actions"><button type="button" className="text-button" onClick={() => setPendingRemoval(null)}>Cancelar</button><button type="button" className="danger-button" disabled={deleteHabit.isPending} onClick={() => remove(habit)}>Confirmar eliminación</button></div></div>}
          </article>
        ))}
      </section>
    </>
  );
}
