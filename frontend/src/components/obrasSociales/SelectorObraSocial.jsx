// =====================================================================
// Selector de obra social para la ficha del cliente.
// Lista las obras sociales activas (las mismas del sobre y del TPV) y
// devuelve el NOMBRE elegido, que es lo que guarda usuarios.obra_social.
// Si el cliente tiene cargado un texto viejo que no está en la lista, se
// muestra igual como opción para no perderlo al guardar.
// =====================================================================
import { useEffect, useState } from 'react';
import { listarObrasSociales } from '../../api/obrasSociales';
import { buscarObraSocialPorNombre } from '../../utils/obrasSociales';

export default function SelectorObraSocial({ id, value, onChange, disabled }) {
  const [obrasSociales, setObrasSociales] = useState([]);

  useEffect(() => {
    listarObrasSociales(true).then(setObrasSociales).catch(() => setObrasSociales([]));
  }, []);

  const actual = buscarObraSocialPorNombre(obrasSociales, value);
  const textoViejo = value && !actual ? value : '';

  return (
    <select id={id} value={actual ? actual.nombre : value || ''} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}>
      <option value="">Sin especificar</option>
      {textoViejo && <option value={textoViejo}>{textoViejo} (cargada a mano)</option>}
      {obrasSociales.map((os) => <option key={os.id} value={os.nombre}>{os.nombre}</option>)}
    </select>
  );
}
