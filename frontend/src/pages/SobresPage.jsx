// =====================================================================
// Sobres / Órdenes de trabajo óptica.
// El Sobre es la orden central: paciente + receta (lejos/cerca por ojo) +
// armazón + cristal + médico + obra social + fecha de entrega.
//
// Etapa 1 (Optix): listado + consola de dos columnas para crear y EDITAR
// un sobre (components/sobres/SobreConsola), con médicos, C.Base/DEG,
// calculadoras ópticas, armazones del stock o del cliente, antropometría,
// cotas y laboratorio. La consola financiera llega en la Etapa 2.
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { listarSobres, obtenerSobre, cambiarEstadoSobre, eliminarSobre } from '../api/sobres';
import { listarSucursales } from '../api/stock';
import { listarUsuarios } from '../api/usuarios';
import { listarObrasSociales } from '../api/obrasSociales';
import { listarMedicos } from '../api/medicos';
import { listarProveedores } from '../api/compras';
import InfoBtn from '../components/InfoBtn';
import SobreConsola from '../components/sobres/SobreConsola';
import { useEsAdmin } from '../hooks/useEsAdmin';

const ESTADOS = ['pendiente', 'reserva', 'en_taller', 'entregado', 'anulado'];
const ESTADO_LABEL = {
  pendiente: 'Pendiente', reserva: 'Reserva', en_taller: 'En taller',
  entregado: 'Entregado', anulado: 'Anulado',
};

export default function SobresPage() {
  const esAdmin = useEsAdmin();
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [clientes, setClientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [laboratorios, setLaboratorios] = useState([]);
  const [sobres, setSobres] = useState([]);
  const [estadoFiltro, setEstadoFiltro] = useState('');
  // consola: null = cerrada; { sobre: null } = alta; { sobre } = edición
  const [consola, setConsola] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, u, os, m, labs] = await Promise.all([
          listarSucursales(),
          listarUsuarios({ limit: 300 }),
          listarObrasSociales(true).catch(() => []),
          listarMedicos().catch(() => []),
          listarProveedores('laboratorio').catch(() => []),
        ]);
        setSucursales(s);
        setClientes(u.usuarios);
        setObrasSociales(os);
        setMedicos(m);
        setLaboratorios(labs);
        if (s.length) setSucursalId(s[0].id);
      } catch (err) { setError(err.response?.data?.error || 'No se pudieron cargar los datos'); }
    })();
  }, []);

  const cargar = useCallback(async (sid, estado) => {
    if (!sid) return;
    try {
      setSobres(await listarSobres({ sucursal_id: sid, estado: estado || undefined }));
    } catch (err) { setError(err.response?.data?.error || 'No se pudieron cargar los sobres'); }
  }, []);

  useEffect(() => { cargar(sucursalId, estadoFiltro); }, [sucursalId, estadoFiltro, cargar]);

  async function abrir(s) {
    setError(''); setOk('');
    try {
      const completo = await obtenerSobre(s.id);
      setConsola({ sobre: completo });
    } catch (err) { setError(err.response?.data?.error || 'No se pudo abrir el sobre'); }
  }

  function alGuardar(guardado) {
    setOk(consola?.sobre ? `Sobre #${guardado.numero} actualizado.` : `Sobre #${guardado.numero} creado.`);
    setConsola(null);
    cargar(sucursalId, estadoFiltro);
  }

  async function cambiar(id, estado) {
    setError(''); setOk('');
    try { await cambiarEstadoSobre(id, estado); cargar(sucursalId, estadoFiltro); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar el estado'); }
  }

  async function borrar(s) {
    if (!window.confirm(`¿Eliminar el sobre #${s.numero}?`)) return;
    setError(''); setOk('');
    try { await eliminarSobre(s.id); setOk('Sobre eliminado.'); cargar(sucursalId, estadoFiltro); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo eliminar'); }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Sobres / Órdenes de trabajo
          <InfoBtn
            paraQue="Es la orden de trabajo central de la óptica: junta el paciente, la receta, el armazón y el cristal en un solo lugar."
            comoFunciona="Creá o abrí un sobre, cargá la receta de lejos y cerca (con las calculadoras de transposición y adición), elegí el armazón del stock o el del cliente y seguilo por su estado."
            conQueFin="Tené trazado cada trabajo del taller, de la receta a la entrega, sin perder ningún dato técnico."
          />
        </h1>
        <div className="tryon-toolbar">
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} disabled={Boolean(consola)}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
          </select>
          {!consola && (
            <button type="button" className="btn btn--primary btn--inline" onClick={() => { setOk(''); setConsola({ sobre: null }); }}>
              + Nuevo sobre
            </button>
          )}
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="alert alert--ok" role="status">{ok}</p>}

      {consola && (
        <SobreConsola
          key={consola.sobre?.id || 'nuevo'}
          sobre={consola.sobre}
          sucursalId={sucursalId}
          clientes={clientes}
          obrasSociales={obrasSociales}
          medicos={medicos}
          laboratorios={laboratorios}
          esAdmin={esAdmin}
          onGuardado={alGuardar}
          onCancelar={() => setConsola(null)}
          onMedicoCreado={(m) => setMedicos((prev) => [...prev, m].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
        />
      )}

      <div className="card no-pad">
        <table className="table">
          <thead><tr><th>#</th><th>Paciente</th><th>Médico</th><th>Obra social</th><th>Entrega</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead>
          <tbody>
            {sobres.length === 0 ? (
              <tr><td colSpan="8" className="muted" style={{ padding: '1rem' }}>Sin sobres para este filtro.</td></tr>
            ) : sobres.map((s) => (
              <tr key={s.id} className={consola?.sobre?.id === s.id ? 'fila-activa' : ''}>
                <td>{s.numero}</td>
                <td>{s.cliente_nombre || '—'}</td>
                <td className="small">{s.medico_nombre || s.medico || '—'}</td>
                <td>{s.obra_social_nombre || 'Particular'}</td>
                <td className="small">{s.fecha_entrega ? new Date(s.fecha_entrega).toLocaleDateString() : '—'}</td>
                <td><span className="badge">{ESTADO_LABEL[s.estado]}</span></td>
                <td>$ {Number(s.total).toFixed(2)}</td>
                <td className="col-mov">
                  <button type="button" className="btn-mini btn-mini--wide" onClick={() => abrir(s)}>Abrir</button>
                  <select
                    className="select-estado"
                    value={s.estado}
                    onChange={(e) => cambiar(s.id, e.target.value)}
                    aria-label={`Estado del sobre ${s.numero}`}
                  >
                    {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                  </select>
                  {esAdmin && (
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => borrar(s)}>Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
