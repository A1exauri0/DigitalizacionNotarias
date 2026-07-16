/**
 * Proceso Principal de Electron (main.js).
 * Administra el ciclo de vida de las ventanas (Login centrado y Widget flotante),
 * gestiona la autenticación HTTP y el monitoreo asíncrono en caliente de PDFs.
 * Reutiliza el archivo de configuración config.json original de la app C#.
 */

const { app, BrowserWindow, ipcMain, dialog, screen } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const axios = require("axios");

const watcher = require("./utils/watcherDirectorios");

// Ruta de configuración exacta de la aplicación C# original
const RUTA_CONFIG = path.join(
  app.getPath("appData"),
  "CapturaNotarias",
  "config.json",
);

let ventanaLogin = null;
let ventanaWidget = null;
let intervaloReintentos = null;

// Estructura de configuración por defecto
const CONFIG_POR_DEFECTO = {
  RutaServidorAuditoria: "\\\\192.168.1.10\\NOTARIAS",
  UltimaRutaVigilada: "",
  NombrePC: "",
  LugarTrabajo: "IREC",
  UrlApi: "http://192.168.1.10:3000/api/registrar",
  ActivarEnvioAuditoria: false,
  TipoCaptura: "NOTARIAS",
};

// Resuelve dinámicamente la URL del servidor basada en la ruta o IP de red de C#
function obtenerUrlServidor(config) {
  const ruta = config.RutaServidorAuditoria || "";

  if (ruta.startsWith("\\\\") || ruta.startsWith("//")) {
    const sinBarras = ruta.replace(/^[\\/]+/, "");
    const idx =
      sinBarras.indexOf("\\") !== -1
        ? sinBarras.indexOf("\\")
        : sinBarras.indexOf("/");
    const host = idx !== -1 ? sinBarras.substring(0, idx) : sinBarras;
    return `http://${host}:3000`;
  }

  return "http://localhost:3000";
}

// Lee la configuración config.json de AppData
async function obtenerConfiguracion() {
  try {
    const directorio = path.dirname(RUTA_CONFIG);
    await fs.mkdir(directorio, { recursive: true });
    try {
      await fs.access(RUTA_CONFIG);
      const contenido = await fs.readFile(RUTA_CONFIG, "utf8");
      return JSON.parse(contenido);
    } catch (e) {
      await fs.writeFile(
        RUTA_CONFIG,
        JSON.stringify(CONFIG_POR_DEFECTO, null, 2),
        "utf8",
      );
      return CONFIG_POR_DEFECTO;
    }
  } catch (error) {
    console.error("Error al obtener la configuración:", error);
    return CONFIG_POR_DEFECTO;
  }
}

// Guarda la configuración local en config.json
async function guardarConfiguracion(config) {
  try {
    const directorio = path.dirname(RUTA_CONFIG);
    await fs.mkdir(directorio, { recursive: true });

    // Mantener la URL del API por compatibilidad
    if (!config.UrlApi) {
      config.UrlApi = CONFIG_POR_DEFECTO.UrlApi;
    }

    await fs.writeFile(RUTA_CONFIG, JSON.stringify(config, null, 2), "utf8");
    global.configuracionPC = config;
    return config;
  } catch (error) {
    console.error("Error al guardar la configuración:", error);
    throw error;
  }
}

// Crea la ventana de inicio de sesión (centrada)
function crearVentanaLogin() {
  if (ventanaLogin) return;

  ventanaLogin = new BrowserWindow({
    width: 460,
    height: 380,
    resizable: false,
    title: "Digitalizacion Notarias",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  ventanaLogin.loadFile(path.join(__dirname, "views", "login.html"));

  ventanaLogin.on("closed", () => {
    ventanaLogin = null;
  });
}

// Crea el widget de monitoreo flotante (abajo a la derecha)
function crearVentanaWidget() {
  if (ventanaWidget) return;

  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  const widgetWidth = 340;
  const widgetHeight = 180;

  // Posicionar en la esquina inferior derecha
  const posX = width - widgetWidth - 15;
  const posY = height - widgetHeight - 15;

  ventanaWidget = new BrowserWindow({
    width: widgetWidth,
    height: widgetHeight,
    x: posX,
    y: posY,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    title: "Digitalizacion Notarias",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ventanaWidget.loadFile(path.join(__dirname, "views", "captura.html"));
  global.ventanaPrincipal = ventanaWidget;

  ventanaWidget.on("closed", () => {
    ventanaWidget = null;
    global.ventanaPrincipal = null;
  });
}

// Inicialización de la aplicación
app.whenReady().then(async () => {
  // 1. Cargar configuración
  const config = await obtenerConfiguracion();
  global.configuracionPC = config;

  // 2. Levantar pantalla de Login
  crearVentanaLogin();

  // 3. Intervalo de reintentos de red
  intervaloReintentos = setInterval(() => {
    watcher.ejecutarSincronizacionPendientes();
  }, 15000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (global.usuarioSesion) {
        crearVentanaWidget();
      } else {
        crearVentanaLogin();
      }
    }
  });
});

app.on("window-all-closed", () => {
  watcher.detenerWatcher();
  if (intervaloReintentos) {
    clearInterval(intervaloReintentos);
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC Handler: Diálogo nativo de directorios
ipcMain.handle("seleccionar-directorio", async () => {
  const ventanaActiva = ventanaWidget || ventanaLogin;
  if (!ventanaActiva) return null;

  const resultado = await dialog.showOpenDialog(ventanaActiva, {
    properties: ["openDirectory"],
  });

  if (resultado.canceled) {
    return null;
  }
  return resultado.filePaths[0];
});

// IPC Handler: Configuración
ipcMain.handle("obtener-configuracion", async () => {
  return await obtenerConfiguracion();
});

ipcMain.handle("guardar-configuracion", async (evento, nuevaConfig) => {
  return await guardarConfiguracion(nuevaConfig);
});

// IPC Handler: Intento de Inicio de Sesión
ipcMain.handle("intentar-login", async (evento, { usuario, pin }) => {
  const config = await obtenerConfiguracion();
  const urlBase = obtenerUrlServidor(config);

  // Intentar autenticación contra la API HTTP
  try {
    const urlLogin = `${urlBase}/api/usuarios/login`;
    console.log(`Intentando conectar para login en: ${urlLogin}`);

    const respuesta = await axios.post(
      urlLogin,
      {
        nombre_usuario: usuario,
        pin: pin,
      },
      { timeout: 6000 },
    );

    if (respuesta.data && respuesta.data.ok && respuesta.data.usuario) {
      const datosUser = respuesta.data.usuario;

      // Guardar sesión en memoria global del proceso principal
      global.usuarioSesion = datosUser;

      // Pasar datos de sesión a memoria de la configuración
      config.usuarioActual =
        datosUser.nombre_completo || datosUser.nombre_usuario;
      config.usuarioCorto = datosUser.nombre_usuario;
      config.turnoActual = datosUser.turno || "Matutino";
      await guardarConfiguracion(config);

      // Iniciar el watcher de directorios si ya tiene ruta
      if (config.UltimaRutaVigilada) {
        // Extraer ip para chokidar
        const ip = urlBase.replace("http://", "").split(":")[0];
        watcher.iniciarWatcher(config.UltimaRutaVigilada, ip, "3000");
      }

      // Ocultar login y abrir widget flotante
      if (ventanaLogin) {
        ventanaLogin.close();
        ventanaLogin = null;
      }
      crearVentanaWidget();

      return { ok: true, usuario: datosUser };
    }
  } catch (error) {
    console.warn("Fallo de conexión o login al servidor:", error.message);
  }

  // Fallback de administrador offline
  if (usuario === "admin" && pin === "1234") {
    const userOffline = {
      nombre_usuario: "admin",
      nombre_completo: "Administrador Local (Offline)",
      turno: "Matutino",
    };

    global.usuarioSesion = userOffline;
    config.usuarioActual = userOffline.nombre_completo;
    config.usuarioCorto = userOffline.nombre_usuario;
    config.turnoActual = userOffline.turno;
    await guardarConfiguracion(config);

    if (config.UltimaRutaVigilada) {
      watcher.iniciarWatcher(config.UltimaRutaVigilada, "localhost", "3000");
    }

    if (ventanaLogin) {
      ventanaLogin.close();
      ventanaLogin = null;
    }
    crearVentanaWidget();

    return { ok: true, usuario: userOffline };
  }

  return {
    ok: false,
    mensaje: "Credenciales incorrectas o servidor no disponible.",
  };
});

// IPC Listener: Cerrar Sesión (Regresa a Login)
ipcMain.on("cerrar-sesion", () => {
  watcher.detenerWatcher();
  global.usuarioSesion = null;

  if (ventanaWidget) {
    ventanaWidget.close();
    ventanaWidget = null;
  }
  crearVentanaLogin();
});

// IPC Listener: Watcher manual
ipcMain.on("iniciar-monitoreo", async () => {
  const config = await obtenerConfiguracion();
  if (config.UltimaRutaVigilada) {
    const urlBase = obtenerUrlServidor(config);
    const ip = urlBase.replace("http://", "").split(":")[0];
    watcher.iniciarWatcher(config.UltimaRutaVigilada, ip, "3000");
    if (ventanaWidget) {
      ventanaWidget.webContents.send("estado-watcher-cambiado", "Monitoreando");
    }
  }
});

ipcMain.on("detener-monitoreo", () => {
  watcher.detenerWatcher();
  if (ventanaWidget) {
    ventanaWidget.webContents.send("estado-watcher-cambiado", "Inactivo");
  }
});
