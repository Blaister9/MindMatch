# Checklist demo MindMatch RC

- Equipo cargado y cargador conectado.
- Docker Desktop abierto; PostgreSQL y Redis healthy.
- RC version `0.1.0-rc.1` y `.runtime/build-manifest.json` presentes.
- Puertos libres o registrados por RC: API 3001, paciente 5173, doctora 5174.
- `pnpm demo:doctor` sin `ERROR`.
- Seed limpio preparado con firma esperada.
- Analytics generado.
- URLs: doctora `http://127.0.0.1:5174`, paciente `http://127.0.0.1:5173`.
- Cuenta doctora y paciente smoke verificadas.
- Navegador normal para doctora; ventana privada para paciente.
- Notificaciones del sistema apagadas.
- Zoom/proyector probado.
- Internet no requerido para el recorrido.
- Logs revisados en `.runtime/logs`.
- Recorrido ensayado una vez.
- Reset final hecho con tiempo suficiente.
- No hacer actualizaciones del sistema el dia del evento.
