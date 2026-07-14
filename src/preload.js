/**
 * Preload Script de Electron (preload.js).
 * Expone de manera segura canales IPC entre el proceso principal y la UI del Renderer.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("apiElectron", {
  // Configuración de la aplicación
  obtenerConfiguracion: () => ipcRenderer.invoke("obtener-configuracion"),
  guardarConfiguracion: (config) => ipcRenderer.invoke("guardar-configuracion", config),
  seleccionarDirectorio: () => ipcRenderer.invoke("seleccionar-directorio"),

  // Control de Sesión y Autenticación
  intentarLogin: (usuario, pin) => ipcRenderer.invoke("intentar-login", { usuario, pin }),
  cerrarSesion: () => ipcRenderer.send("cerrar-sesion"),

  // Control del Watcher en caliente
  iniciarMonitoreo: () => ipcRenderer.send("iniciar-monitoreo"),
  detenerMonitoreo: () => ipcRenderer.send("detener-monitoreo"),

  // Escuchadores de eventos asíncronos para el Widget
  alDetectarRegistro: (callback) => {
    ipcRenderer.on("registro-detectado", (e, reg) => callback(reg));
  },
  alSincronizarRegistro: (callback) => {
    ipcRenderer.on("registro-sincronizado", (e, datos) => callback(datos));
  },
  alCambiarEstadoWatcher: (callback) => {
    ipcRenderer.on("estado-watcher-cambiado", (e, estado) => callback(estado));
  },
  alCambiarConexion: (callback) => {
    ipcRenderer.on("conexion-estado", (e, datos) => callback(datos));
  }
});
