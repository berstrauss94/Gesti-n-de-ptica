# Reglas de UI por sección — Óptica / Centro de Contactología

Estas reglas son permanentes y aplican a toda página/sección del frontend
(`frontend/src/pages/*.jsx` y `frontend/src/styles.css`). Respetarlas siempre
que se cree o modifique una sección con título.

## 1. Botón de ayuda "!" (InfoBtn) en cada sección

- TODA sección con título principal debe llevar, a la derecha del `<h1>`, el
  componente reutilizable `InfoBtn`, importado desde `../components/InfoBtn`.
- `InfoBtn` es un botón "!" (clase `.info-btn`) que abre un popover
  (`.info-popover`) con EXACTAMENTE 3 puntos, pasados como props:
  - `paraQue` → "¿Para qué sirve?": qué administra o resuelve la sección.
  - `comoFunciona` → "¿Cómo funciona?": pasos o acciones principales.
  - `conQueFin` → "¿Con qué fin?": el objetivo de negocio de la sección.
- Patrón JSX estándar:

  ```jsx
  <h1>
    Título de la sección
    <InfoBtn
      paraQue="..."
      comoFunciona="..."
      conQueFin="..."
    />
  </h1>
  ```

- El popover se cierra al hacer clic/tap fuera (ya implementado en
  `InfoBtn.jsx`). NO reimplementar esa lógica: reutilizar el componente.
- Textos en español rioplatense (voseo: "cargá", "revisá", "tené"), claros y
  breves (1 frase por punto).
- NO duplicar el código del botón en cada página: usar siempre el componente.
  Si el componente no existe en un proyecto nuevo, crearlo primero en
  `frontend/src/components/InfoBtn.jsx` con los estilos `.info-btn` /
  `.info-popover` en `styles.css`.

## 2. Capas y sombras (que nada se superponga ni se transparente)

- **Popover de ayuda** (`.info-popover`): fondo 100% opaco (`#ffffff`),
  `z-index` alto (`200`, por encima de cualquier dropdown/autocompletado que
  suele estar en `z-index: 60`) y sombra marcada. Debe quedar SIEMPRE por
  delante y despegado del contenido de abajo.
- **Casillas de texto** (`.field input/select/textarea` y
  `.searchbar input[type=search]`): fondo blanco opaco + sombra sutil
  (`box-shadow` aprox. `0 2px 6-8px rgba(15, 23, 42, 0.08-0.10)`) para
  diferenciarse de la capa de fondo de la sección.
- **Paneles flotantes propios de la sección** (resultados de búsqueda,
  autocompletados, dropdowns): fondo opaco y un `z-index` MENOR que el del
  popover de ayuda (nunca `>= 200`), para que el `InfoBtn` no quede tapado.
- Al agregar un nuevo campo, panel o dropdown: verificar que no compita en el
  mismo `z-index` con el popover de ayuda ni se vea translúcido sobre el fondo
  platinado (`--gris-fondo: #b9b9be`).

## 3. Mapa de z-index de referencia

| Capa                                   | z-index |
|----------------------------------------|---------|
| Fondo de sección (`.seccion-fondo`)    | 0       |
| Contenido / casillas                   | 1       |
| Sidebar                                | 40      |
| Tooltips del sidebar / modales / menú  | 50–60   |
| Dropdowns / autocompletados / paneles  | 60      |
| **Popover de ayuda (`.info-popover`)** | **200** |

El popover de ayuda siempre va arriba de todo lo flotante de la sección.
