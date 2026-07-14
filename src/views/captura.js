/**
 * Lógica del Renderer del Widget Flotante de Monitoreo (captura.js).
 * Administra el estado en tiempo real de la carpeta vigilada y el contador de sesión.
 */

let contadorSesion = 0;
let configLocal = null;

document.addEventListener("DOMContentLoaded", async () => {
  const lblUsuario = document.getElementById("lblUsuario");
  const lblRuta = document.getElementById("lblRuta");
  const btnCerrarSesion = document.getElementById("btnCerrarSesion");
  const btnCambiarRuta = document.getElementById("btnCambiarRuta");
  
  const wrapperEstatus = document.getElementById("wrapperEstatus");
  const lblEstatus = document.getElementById("lblEstatus");
  const lblContador = document.getElementById("lblContador");

  // 1. Cargar Configuración e Información del Capturista
  configLocal = await window.apiElectron.obtenerConfiguracion();
  if (configLocal) {
    const nombre = configLocal.usuarioActual || "Capturista Local";
    const turno = configLocal.turnoActual || "Matutino";
    lblUsuario.textContent = `${nombre} (${turno})`;

    if (configLocal.UltimaRutaVigilada) {
      lblRuta.textContent = `Ruta: ${configLocal.UltimaRutaVigilada}`;
      actualizarInterfazWatcher("Monitoreando");
    } else {
      lblRuta.textContent = "Ruta: Sin vigilar. Elige una carpeta.";
      actualizarInterfazWatcher("Inactivo");
    }
  }

  // 2. Evento: Cambiar Carpeta de Trabajo
  btnCambiarRuta.addEventListener("click", async () => {
    const nuevaRuta = await window.apiElectron.seleccionarDirectorio();
    if (nuevaRuta) {
      configLocal.UltimaRutaVigilada = nuevaRuta;
      lblRuta.textContent = `Ruta: ${nuevaRuta}`;
      
      // Guardar e iniciar watcher en caliente
      await window.apiElectron.guardarConfiguracion(configLocal);
      actualizarInterfazWatcher("Monitoreando");
    }
  });

  // 3. Evento: Cerrar Sesión y volver al Login
  btnCerrarSesion.addEventListener("click", () => {
    window.apiElectron.cerrarSesion();
  });

  // 4. IPC: Escuchar Nuevos PDFs Detectados en el Watcher
  window.apiElectron.alDetectarRegistro((nuevoRegistro) => {
    contadorSesion++;
    lblContador.textContent = `Capturados: ${contadorSesion}`;
    
    // Retroalimentación visual momentánea
    lblEstatus.textContent = "Guardando...";
    wrapperEstatus.className = "estatus-watcher"; // Mantener verde o cambiar a color cargando
    
    setTimeout(() => {
      lblEstatus.textContent = "Vigilando";
    }, 2500);
  });

  // IPC: Escuchar Sincronización Exitosa con MySQL Central
  window.apiElectron.alSincronizarRegistro((datos) => {
    console.log(`Archivo sincronizado con éxito: ${datos.archivo}`);
  });

  // IPC: Escuchar Cambios de Conectividad con el Servidor
  const lblRed = document.getElementById("lblRed");
  window.apiElectron.alCambiarConexion((datos) => {
    if (datos.online) {
      lblRed.style.color = "var(--color-exito)";
      lblRed.innerHTML = `<iconify-icon icon="mdi:wifi" style="font-size: 13px;"></iconify-icon> <span>Online</span>`;
    } else {
      lblRed.style.color = "var(--color-peligro)";
      lblRed.innerHTML = `<iconify-icon icon="mdi:wifi-off" style="font-size: 13px;"></iconify-icon> <span>Offline</span>`;
    }
  });

  // IPC: Escuchar Cambios del Watcher
  window.apiElectron.alCambiarEstadoWatcher((estado) => {
    actualizarInterfazWatcher(estado);
  });

  // Modifica la luz de pulso y la etiqueta de estatus
  function actualizarInterfazWatcher(estado) {
    if (estado === "Monitoreando") {
      wrapperEstatus.className = "estatus-watcher";
      lblEstatus.textContent = "Vigilando";
    } else {
      wrapperEstatus.className = "estatus-watcher inactivo";
      lblEstatus.textContent = "Inactivo";
    }
  }
});
