/**
 * Watcher y Procesador Secuencial de PDFs Detectados (watcherDirectorios.js).
 * Monitorea cambios en directorios con chokidar, procesa archivos de manera estable
 * y sincroniza registros de auditoría directamente con el servidor central Express.
 * No utiliza base de datos local SQLite ni JSON.
 */

const chokidar = require("chokidar");
const path = require("path");
const fs = require("fs").promises;
const axios = require("axios");

const { obtenerPaginasPdf } = require("./contadorPaginas");

let watcherInstancia = null;
let colaProcesamiento = [];
let procesandoCola = false;

// Historial en memoria de la sesión para reintentos de red
let pendientesSincronizacion = [];

// Configuración de red del servidor central
let ipServidor = "localhost";
let puertoServidor = "3000";

// Inicia el watcher sobre la ruta especificada
function iniciarWatcher(rutaMonitoreo, ip = "localhost", puerto = "3000") {
  ipServidor = ip;
  puertoServidor = puerto;

  if (watcherInstancia) {
    watcherInstancia.close();
  }

  console.log(`Iniciando monitoreo de PDFs en: ${rutaMonitoreo}`);

  watcherInstancia = chokidar.watch(rutaMonitoreo, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    depth: 9,
    ignoreInitial: true,
    usePolling: true,
    interval: 1000,
    binaryInterval: 3000,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500
    }
  });

  watcherInstancia.on("add", (rutaCompleta) => {
    if (path.extname(rutaCompleta).toLowerCase() === ".pdf") {
      encolarArchivo(rutaCompleta);
    }
  });

  watcherInstancia.on("error", (error) => {
    console.error("Error en Watcher de directorios:", error);
  });
}

// Detiene el watcher activo
function detenerWatcher() {
  if (watcherInstancia) {
    watcherInstancia.close();
    watcherInstancia = null;
    console.log("Watcher de directorios detenido.");
  }
}

// Encola un archivo PDF para procesamiento asíncrono ordenado
function encolarArchivo(rutaCompleta) {
  console.log(
    `Archivo encolado para validación: ${path.basename(rutaCompleta)}`,
  );
  colaProcesamiento.push(rutaCompleta);
  procesarSiguienteEnCola();
}

// Procesa la cola secuencialmente de uno en uno
async function procesarSiguienteEnCola() {
  if (procesandoCola || colaProcesamiento.length === 0) return;

  procesandoCola = true;
  const rutaCompleta = colaProcesamiento.shift();

  try {
    await procesarArchivoPdf(rutaCompleta);
  } catch (error) {
    console.error(
      `Error al procesar archivo en la cola (${rutaCompleta}):`,
      error.message,
    );
  } finally {
    procesandoCola = false;
    setTimeout(procesarSiguienteEnCola, 100);
  }
}

// Espera que un archivo termine de escribirse (tamaño estable por 1.5s)
async function esperarArchivoListo(ruta, timeoutSegundos = 30) {
  let ultimoTamano = -1;
  let vecesIgual = 0;

  // Tiempo de gracia inicial
  await new Promise((r) => setTimeout(r, 1000));

  for (let i = 0; i < timeoutSegundos * 2; i++) {
    try {
      const stats = await fs.stat(ruta);
      const tamanoActual = stats.size;

      if (tamanoActual > 0) {
        if (tamanoActual === ultimoTamano) {
          vecesIgual++;
          if (vecesIgual >= 3) {
            let fd;
            try {
              fd = await fs.open(ruta, "r+");
              return true;
            } catch (errBloqueo) {
              vecesIgual = 0;
            } finally {
              if (fd) await fd.close();
            }
          }
        } else {
          ultimoTamano = tamanoActual;
          vecesIgual = 0;
        }
      }
    } catch (e) {
      vecesIgual = 0;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// Parsea la ruta física para extraer la Notaría y el Volumen de forma robusta
function extraerNotariaYVolumen(rutaCompleta) {
  const rutaNormalizada = rutaCompleta.replace(/\\/g, "/");
  const partes = rutaNormalizada.split("/");
  let notaria = "NOTARIA GENERAL";
  let volumen = "SIN VOLUMEN";

  const indexNotaria = partes.findIndex((p) => {
    const u = p.toUpperCase().trim();
    return u.startsWith("NOTARIA") && u !== "NOTARIAS";
  });

  if (indexNotaria !== -1) {
    notaria = partes[indexNotaria].trim();

    // Si hay subcarpetas intermedias entre la notaría y el archivo final (.pdf)
    const indexArchivo = partes.length - 1;
    if (indexArchivo - 1 > indexNotaria) {
      volumen = partes[indexArchivo - 1].trim();
    }
  }

  return { notaria, volumen };
}

// Procesa e intenta sincronizar un archivo PDF de forma secuencial
async function procesarArchivoPdf(rutaCompleta) {
  const archivo = path.basename(rutaCompleta);
  console.log(`Procesando archivo: ${archivo}`);

  // 1. Esperar estabilidad del archivo (evita conteos de 1 página)
  const listo = await esperarArchivoListo(rutaCompleta, 5);
  if (!listo) {
    console.warn(`El archivo ${archivo} no se estabilizó a tiempo en disco.`);
  }

  // 2. Extraer Notaría y Volumen de la ruta física
  const { notaria, volumen } = extraerNotariaYVolumen(rutaCompleta);

  // 3. Contar páginas físicamente
  const paginas = await obtenerPaginasPdf(rutaCompleta);
  console.log(`Conteo de páginas finalizado para ${archivo}: ${paginas} pág.`);

  // 4. Obtener datos de la PC desde la configuración global en main
  const config = global.configuracionPC || {};

  // 5. Crear el registro en memoria
  const nuevoRegistro = {
    fecha_hora: new Date().toISOString().slice(0, 19).replace("T", " "),
    turno: config.turnoActual || "Matutino",
    usuario: config.usuarioCorto || "Capturista Local",
    pc: config.NombrePC || "PC-CLIENTE",
    notaria,
    volumen: volumen === "SIN VOLUMEN" ? null : volumen,
    archivo,
    paginas,
    detalles: `PDF Escaneado en ${rutaCompleta}`,
    exportado: 0,
    rutaCompleta,
  };

  // Notificar inmediatamente al renderer para mostrarlo en el historial de hoy
  if (global.ventanaPrincipal) {
    global.ventanaPrincipal.webContents.send(
      "registro-detectado",
      nuevoRegistro,
    );
  }

  // 6. Intentar sincronizar con el Servidor Central
  const sincronizado = await intentarSincronizarRegistro(nuevoRegistro);
  if (!sincronizado) {
    // Si falla, encolar en memoria para reintentos periódicos
    pendientesSincronizacion.push(nuevoRegistro);
  }
}

// Envía un registro de la auditoría e intenta transferir el archivo al servidor por API
async function intentarSincronizarRegistro(registro) {
  try {
    const urlSubir = `http://${ipServidor}:${puertoServidor}/api/registrar`;
    console.log(`Sincronizando registro con servidor central en: ${urlSubir}`);

    const respuesta = await axios.post(
      urlSubir,
      {
        fecha_hora:
          registro.fecha_hora && registro.fecha_hora.includes("T")
            ? registro.fecha_hora.slice(0, 19).replace("T", " ")
            : registro.fecha_hora,
        turno: registro.turno,
        usuario: registro.usuario,
        pc: registro.pc,
        notaria: registro.notaria,
        volumen: registro.volumen,
        archivo: registro.archivo,
        paginas: registro.paginas,
        detalles: registro.detalles || null,
        lugar_trabajo:
          (global.configuracionPC && global.configuracionPC.LugarTrabajo) ||
          null,
      },
      { timeout: 6000 },
    );

    if (respuesta.data && respuesta.data.ok) {
      if (respuesta.data.duplicados > 0) {
        console.log(
          `Omitido por duplicado (ya registrado anteriormente en MySQL): ${registro.archivo}`,
        );
      } else {
        console.log(
          `Sincronización exitosa en MySQL (registro insertado): ${registro.archivo}`,
        );
      }

      if (global.ventanaPrincipal) {
        global.ventanaPrincipal.webContents.send("registro-sincronizado", {
          archivo: registro.archivo,
          exportado: 1,
        });
      }
      return true;
    } else {
      console.warn(`Servidor rechazó registro: ${respuesta.data.mensaje}`);
      return false;
    }
  } catch (error) {
    console.warn(
      `Error al conectar con el servidor central (${registro.archivo}): ${error.message}`,
    );
    return false;
  }
}

// Tarea periódica para reintentar sincronizar registros locales pendientes (exportado = 0)
async function ejecutarSincronizacionPendientes() {
  if (pendientesSincronizacion.length === 0) return;

  console.log(
    `Sincronizando ${pendientesSincronizacion.length} registros pendientes en memoria...`,
  );

  const pendientesRestantes = [];
  for (const reg of pendientesSincronizacion) {
    const exito = await intentarSincronizarRegistro(reg);
    if (!exito) {
      pendientesRestantes.push(reg);
    }
  }

  pendientesSincronizacion = pendientesRestantes;
}

let intervaloPing = null;

// Verifica si el Servidor Central está en línea y envía el estado IPC
async function verificarConexionServidor() {
  try {
    const urlHealth = `http://${ipServidor}:${puertoServidor}/api/digitalizacion`;
    const respuesta = await axios.get(urlHealth, { timeout: 2500 });
    const online = respuesta.data && respuesta.data.ok;

    if (
      global.ventanaPrincipal &&
      !global.ventanaPrincipal.webContents.isDestroyed()
    ) {
      global.ventanaPrincipal.webContents.send("conexion-estado", { online });
    }
    return online;
  } catch (err) {
    if (
      global.ventanaPrincipal &&
      !global.ventanaPrincipal.webContents.isDestroyed()
    ) {
      global.ventanaPrincipal.webContents.send("conexion-estado", {
        online: false,
      });
    }
    return false;
  }
}

// Envuelve el inicio del watcher con el temporizador de conectividad
const iniciarWatcherOriginal = iniciarWatcher;
iniciarWatcher = function (rutaMonitoreo, ip = "localhost", puerto = "3000") {
  iniciarWatcherOriginal(rutaMonitoreo, ip, puerto);

  if (intervaloPing) clearInterval(intervaloPing);
  verificarConexionServidor();
  intervaloPing = setInterval(verificarConexionServidor, 5000);
};

// Envuelve la detención del watcher para limpiar el temporizador
const detenerWatcherOriginal = detenerWatcher;
detenerWatcher = function () {
  detenerWatcherOriginal();
  if (intervaloPing) {
    clearInterval(intervaloPing);
    intervaloPing = null;
  }
};

module.exports = {
  iniciarWatcher,
  detenerWatcher,
  ejecutarSincronizacionPendientes,
  verificarConexionServidor,
};
