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
    const nombre = configLocal.usuarioCorto || "Capturista";
    lblUsuario.textContent = nombre;

    if (configLocal.UltimaRutaVigilada) {
      lblRuta.textContent = `Ruta: ${configLocal.UltimaRutaVigilada}`;
      window.apiElectron.iniciarMonitoreo(); // Asegurar inicio del watcher
      actualizarInterfazWatcher("Monitoreando");
    } else {
      lblRuta.textContent = "Ruta: Sin vigilar. Elige una carpeta.";
      actualizarInterfazWatcher("Inactivo");
    }
  }

  const btnToggleHistorial = document.getElementById("btnToggleHistorial");

  // Cargar e inicializar el contador de capturas del dia
  async function inicializarContador() {
    const registros = await window.apiElectron.obtenerHistorialSesion();
    const hoyStr = new Date().toISOString().slice(0, 10);
    const registrosDeHoy = registros.filter(r => r.fecha_hora && r.fecha_hora.startsWith(hoyStr));
    contadorSesion = registrosDeHoy.length;
    lblContador.textContent = `Capturados: ${contadorSesion}`;
  }

  await inicializarContador();

  // 2. Evento: Cambiar Carpeta de Trabajo
  btnCambiarRuta.addEventListener("click", async () => {
    const nuevaRuta = await window.apiElectron.seleccionarDirectorio();
    if (nuevaRuta) {
      configLocal.UltimaRutaVigilada = nuevaRuta;
      lblRuta.textContent = `Ruta: ${nuevaRuta}`;
      
      // Guardar e iniciar watcher en caliente
      await window.apiElectron.guardarConfiguracion(configLocal);
      window.apiElectron.iniciarMonitoreo(); // Reiniciar watcher con la nueva ruta en caliente
      actualizarInterfazWatcher("Monitoreando");
    }
  });

  // Evento: Abrir Ventana Independiente de Historial
  if (btnToggleHistorial) {
    btnToggleHistorial.addEventListener("click", () => {
      window.apiElectron.abrirHistorial();
    });
  }

  // 3. Evento: Cerrar Sesión y volver al Login
  btnCerrarSesion.addEventListener("click", () => {
    window.apiElectron.cerrarSesion();
  });

  // 4. IPC: Escuchar Nuevos PDFs Detectados en el Watcher
  window.apiElectron.alDetectarRegistro(async (nuevoRegistro) => {
    // Recargar contador en caliente
    await inicializarContador();

    // Retroalimentación visual momentánea en estatus
    lblEstatus.textContent = "Guardando...";
    wrapperEstatus.className = "estatus-watcher";
    
    setTimeout(() => {
      lblEstatus.textContent = "Vigilando";
    }, 2500);
  });

  // IPC: Escuchar Sincronización Exitosa con MySQL Central
  window.apiElectron.alSincronizarRegistro(async (datos) => {
    console.log(`Archivo sincronizado con éxito: ${datos.archivo}`);
    // Actualizar el contador en caliente
    await inicializarContador();
  });

  // IPC: Escuchar Cambios de Conectividad con el Servidor
  const lblRed = document.getElementById("lblRed");
  window.apiElectron.alCambiarConexion((datos) => {
    if (datos.online) {
      lblRed.style.color = "var(--color-exito)";
      lblRed.innerHTML = `<img src="assets/wifi.svg" style="width: 13px; height: 13px; vertical-align: middle; margin-right: 2px;" alt="Online"> <span>Online</span>`;
    } else {
      lblRed.style.color = "var(--color-peligro)";
      lblRed.innerHTML = `<img src="assets/wifi-off.svg" style="width: 13px; height: 13px; vertical-align: middle; margin-right: 2px;" alt="Offline"> <span>Offline</span>`;
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
