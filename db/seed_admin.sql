-- =====================================================================
-- Seed del usuario administrador inicial
-- =====================================================================
-- La contraseña NO se escribe en este archivo. Se pasa como variable de
-- psql en tiempo de ejecución para no versionar credenciales.
--
-- Uso (PowerShell):
--   psql -d optica `
--     -v admin_user="'Optica_2026'" `
--     -v admin_password="'Optica_2026.1234'" `
--     -f db/seed_admin.sql
--
-- Recomendado: tomar la contraseña de una variable de entorno en vez de
-- escribirla en la línea de comandos:
--   $pwd = $env:ADMIN_PASSWORD
--   psql -d optica -v admin_user="'Optica_2026'" -v admin_password="'$pwd'" -f db/seed_admin.sql
-- =====================================================================

INSERT INTO usuarios_sistema (usuario, password_hash, rol)
VALUES (
    :admin_user,
    crypt(:admin_password, gen_salt('bf', 12)),
    'admin'
)
ON CONFLICT (usuario) DO NOTHING;
