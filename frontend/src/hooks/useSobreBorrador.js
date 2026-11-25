// =====================================================================
// Autoguardado del Sobre en localStorage (borrador local).
// - Al montar: si hay un borrador de ESTE sobre (o del alta, en la misma
//   sucursal) se aplica solo. Si el sobre cambió en el servidor después del
//   borrador, no se aplica: queda como respaldo para "Recuperar".
// - En cada cambio de `datos` ({ form, items, pagos }) se escribe el borrador;
//   si los datos vuelven a ser iguales a lo guardado, se borra.
// - El borrador se borra solo al guardar el sobre (confirmarGuardado) o al
//   limpiar (limpiar deja una copia de respaldo para deshacer con "Recuperar").
// La lógica de almacenamiento está en utils/sobreBorrador.js (probada aparte).
//
// Uso:
//   const borrador = useSobreBorrador({ sobreId, base, version, sucursalId, numero });
//   const [form, setForm] = useState(borrador.inicio.datos.form); ...
//   borrador.sincronizar(datos) se llama desde un efecto de la consola.
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  iniciarBorrador, guardarBorrador, guardarRespaldo, borrarBorrador, borrarRespaldo,
  borrarTodo, leerRespaldo, mismosDatos, combinar, armarBorrador,
} from '../utils/sobreBorrador';

function almacen() {
  try { return window.localStorage; } catch { return null; }
}

export function useSobreBorrador({ sobreId, base, version, sucursalId, numero }) {
  const id = sobreId || null;
  // Decisión inicial: una sola vez por montaje (la consola se remonta por sobre).
  const [inicio] = useState(() => iniciarBorrador(almacen(), { sobreId: id, base, version, sucursalId }));
  const [respaldo, setRespaldo] = useState(inicio.respaldo);
  const [guardadoEn, setGuardadoEn] = useState(inicio.restaurado?.guardadoEn || null);
  const [falla, setFalla] = useState(false);
  const meta = useRef({ version, sucursalId, numero });
  meta.current = { version, sucursalId, numero };
  const primera = useRef(true);

  // Escribe (o borra) el borrador según los datos actuales.
  const sincronizar = useCallback((datos) => {
    // El primer render no escribe: así un borrador que pasó a respaldo no se
    // pisa y uno restaurado no se reescribe igual.
    if (primera.current) { primera.current = false; return; }
    const st = almacen();
    if (mismosDatos(datos, base)) {
      borrarBorrador(st, id);
      setGuardadoEn(null);
      setFalla(false);
      return;
    }
    const ok = guardarBorrador(st, id, datos, meta.current);
    setFalla(!ok);
    if (ok) setGuardadoEn(new Date().toISOString());
  }, [base, id]);

  // "Limpiar": guarda lo actual como respaldo (si había cambios) y borra el borrador.
  const limpiar = useCallback((datosActuales) => {
    const st = almacen();
    if (!mismosDatos(datosActuales, base)) {
      const copia = armarBorrador(datosActuales, meta.current);
      if (guardarRespaldo(st, id, copia)) setRespaldo(copia);
    }
    borrarBorrador(st, id);
    setGuardadoEn(null);
  }, [base, id]);

  // "Recuperar": devuelve los datos del respaldo (completados con la base) y lo consume.
  const recuperar = useCallback(() => {
    const r = respaldo || leerRespaldo(almacen(), id);
    if (!r) return null;
    borrarRespaldo(almacen(), id);
    setRespaldo(null);
    return combinar(base, r.datos);
  }, [respaldo, base, id]);

  // Se guardó en el servidor: ya no hace falta ningún borrador de este sobre.
  const confirmarGuardado = useCallback(() => {
    borrarTodo(almacen(), id);
    setRespaldo(null);
    setGuardadoEn(null);
  }, [id]);

  // Si otra pestaña limpia o guarda este sobre, se refleja el respaldo disponible.
  useEffect(() => {
    function alCambiar() { setRespaldo(leerRespaldo(almacen(), id)); }
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, [id]);

  return {
    inicio, sincronizar, limpiar, recuperar, confirmarGuardado,
    hayRespaldo: Boolean(respaldo), respaldoEn: respaldo?.guardadoEn || null,
    guardadoEn, falla,
  };
}
