/**
 * Lógica del Renderer de la pantalla de Login y Configuración (login.js).
 * Administra el modal de opciones, el formateo de PC y las llamadas IPC de autenticación.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Vincular elementos del Login
  const txtUsuario = document.getElementById("txtUsuario");
  const txtPin = document.getElementById("txtPin");
  const btnIniciarSesion = document.getElementById("btnIniciarSesion");
  const lblError = document.getElementById("lblError");

  // Vincular elementos de Configuración (Modal)
  const btnAbrirConfig = document.getElementById("btnAbrirConfig");
  const btnCerrarConfig = document.getElementById("btnCerrarConfig");
  const modalConfig = document.getElementById("modalConfig");
  const btnGuardarConfig = document.getElementById("btnGuardarConfig");

  const txtServidor = document.getElementById("txtServidor");
  const txtPC = document.getElementById("txtPC");
  const cboLugar = document.getElementById("cboLugar");
  const cboTipo = document.getElementById("cboTipo");

  // 1. Cargar configuración existente en los inputs
  const config = await window.apiElectron.obtenerConfiguracion();
  if (config) {
    txtServidor.value = config.RutaServidorAuditoria || "";
    txtPC.value = config.NombrePC || "";
    cboLugar.value = config.LugarTrabajo || "IREC";
    cboTipo.value = config.TipoCaptura || "NOTARIAS";
  }

  // 2. Control de Apertura/Cierre del Modal de Opciones
  btnAbrirConfig.addEventListener("click", () => {
    modalConfig.style.display = "flex";
    lblError.textContent = "";
  });

  btnCerrarConfig.addEventListener("click", () => {
    modalConfig.style.display = "none";
  });

  // 3. Guardar Configuración (con formateo de PC idéntico a C#)
  btnGuardarConfig.addEventListener("click", async () => {
    let pcVal = txtPC.value.trim().toUpperCase();
    if (pcVal && !pcVal.startsWith("PC-")) {
      const num = parseInt(pcVal, 10);
      if (!isNaN(num)) {
        // Convierte "3" -> "PC-03"
        pcVal = "PC-" + num.toString().padStart(2, "0");
      } else {
        pcVal = "PC-" + pcVal;
      }
      txtPC.value = pcVal;
    }

    const nuevaConfig = {
      NombrePC: pcVal,
      RutaServidorAuditoria: txtServidor.value.trim(),
      LugarTrabajo: cboLugar.value,
      TipoCaptura: cboTipo.value,
      UltimaRutaVigilada: config ? config.UltimaRutaVigilada : "" // Conservar ruta vigilada anterior
    };

    try {
      await window.apiElectron.guardarConfiguracion(nuevaConfig);
      alert("Configuración guardada correctamente.");
      modalConfig.style.display = "none";
    } catch (error) {
      console.error("Error al guardar la configuración:", error);
      alert("Ocurrió un error al guardar la configuración.");
    }
  });

  // 4. Intentar Inicio de Sesión
  btnIniciarSesion.addEventListener("click", async () => {
    const usuario = txtUsuario.value.trim();
    const pin = txtPin.value.trim();

    lblError.textContent = "";

    if (!usuario || !pin) {
      lblError.textContent = "Ingresa usuario y PIN.";
      return;
    }

    btnIniciarSesion.disabled = true;
    btnIniciarSesion.textContent = "Iniciando sesión...";

    try {
      const resultado = await window.apiElectron.intentarLogin(usuario, pin);
      if (!resultado.ok) {
        lblError.textContent = resultado.mensaje || "Acceso denegado.";
        btnIniciarSesion.disabled = false;
        btnIniciarSesion.innerHTML = `<iconify-icon icon="mdi:login" style="font-size: 18px;"></iconify-icon> Iniciar Sesión`;
      }
    } catch (err) {
      console.error("Error en login:", err);
      lblError.textContent = "Fallo de comunicación con la API central.";
      btnIniciarSesion.disabled = false;
      btnIniciarSesion.innerHTML = `<iconify-icon icon="mdi:login" style="font-size: 18px;"></iconify-icon> Iniciar Sesión`;
    }
  });

  // Iniciar al dar Enter en PIN
  txtPin.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      btnIniciarSesion.click();
    }
  });
});
