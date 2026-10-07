// =====================================================================
// Dashboard placeholder. Se llenará en las fases 2 y 3.
// =====================================================================

import { useAuth } from '../context/AuthContext';
import InfoBtn from '../components/InfoBtn';

export default function DashboardPage() {
  const { usuario } = useAuth();

  return (
    <div className="card">
      <h1>
        Bienvenido, {usuario?.usuario}
        <InfoBtn
          paraQue="Es la pantalla de inicio del sistema: punto de entrada tras iniciar sesión."
          comoFunciona="Desde el menú lateral accedés a cada módulo (Clientes, Stock, TPV, Compras, Configuración)."
          conQueFin="Darte una bienvenida y un acceso rápido a todas las áreas de la óptica."
        />
      </h1>
      <p>Sesión iniciada correctamente. El sistema está listo.</p>
      <ul className="roadmap">
        <li>✔ Fase 1 — Autenticación y estructura base</li>
        <li>○ Fase 2 — Biblioteca de clientes y catálogo de marcos</li>
        <li>○ Fase 3 — Prueba Virtual (Canvas)</li>
      </ul>
    </div>
  );
}
