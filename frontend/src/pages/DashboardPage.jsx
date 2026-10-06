// =====================================================================
// Dashboard placeholder. Se llenará en las fases 2 y 3.
// =====================================================================

import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { usuario } = useAuth();

  return (
    <div className="card">
      <h1>Bienvenido, {usuario?.usuario}</h1>
      <p>Sesión iniciada correctamente. El sistema está listo.</p>
      <ul className="roadmap">
        <li>✔ Fase 1 — Autenticación y estructura base</li>
        <li>○ Fase 2 — Biblioteca de clientes y catálogo de marcos</li>
        <li>○ Fase 3 — Prueba Virtual (Canvas)</li>
      </ul>
    </div>
  );
}
