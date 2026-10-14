-- Cuentas: solo las crea el admin (no hay registro público)
CREATE TABLE IF NOT EXISTS usuarios (
  usuario TEXT PRIMARY KEY,
  sal TEXT NOT NULL,
  hash TEXT NOT NULL,
  creado INTEGER NOT NULL
);
-- Sesión = token aleatorio; se guarda solo su SHA-256
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  creado INTEGER NOT NULL,
  usado INTEGER NOT NULL
);
-- Todos los datos de la app de cada persona (JSON) con número de versión
CREATE TABLE IF NOT EXISTS datos (
  usuario TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  rev INTEGER NOT NULL,
  actualizado INTEGER NOT NULL
);
-- Una copia por día por persona (se guardan 90 días)
CREATE TABLE IF NOT EXISTS copias (
  usuario TEXT NOT NULL,
  dia TEXT NOT NULL,
  json TEXT NOT NULL,
  rev INTEGER NOT NULL,
  PRIMARY KEY (usuario, dia)
);
-- Intentos de login fallidos (freno contra adivinar contraseñas)
CREATE TABLE IF NOT EXISTS intentos (
  usuario TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS intentos_u ON intentos (usuario, ts);
-- Código secreto del Atajo de iPhone de cada persona (solo sirve para mandar pasos/energía)
CREATE TABLE IF NOT EXISTS atajos (
  usuario TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  creado INTEGER NOT NULL,
  ultimo INTEGER
);
