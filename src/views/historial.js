/**
 * Controlador de la Vista de Historial (historial.js).
 * Administra la renderización interactiva y en tiempo real de las capturas locales.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const btnRegresar = document.getElementById("btnRegresar");
  const listaHistorial = document.getElementById("listaHistorial");
  const lblPendientesAlerta = document.getElementById("lblPendientesAlerta");
  const lblTotalRegistros = document.getElementById("lblTotalRegistros");
  const lblRed = document.getElementById("lblRed");

  // 1. Cargar y renderizar historial inicial
  async function cargarYRenderizarHistorial() {
    const registros = await window.apiElectron.obtenerHistorialSesion();
    
    if (lblTotalRegistros) {
      lblTotalRegistros.textContent = `Total registros en disco: ${registros.length}`;
    }

    if (!listaHistorial) return;

    if (!registros || registros.length === 0) {
      listaHistorial.innerHTML = `<div class="historial-vacio">Sin capturas registradas en esta PC</div>`;
      if (lblPendientesAlerta) lblPendientesAlerta.style.display = "none";
      return;
    }

    let HTML = "";
    let pendientes = 0;

    registros.forEach(reg => {
      const esSincronizado = reg.sincronizado === 1;
      if (!esSincronizado) pendientes++;

      const iconSrc = esSincronizado ? "assets/wifi.svg" : "assets/wifi-off.svg";
      const iconColor = esSincronizado ? "var(--color-exito)" : "var(--color-peligro)";
      const textStatus = esSincronizado ? "Enviado exitosamente" : "Pendiente de envío a MySQL";

      // Formatear hora de forma limpia
      let hora = "00:00";
      try {
        hora = reg.fecha_hora.split(" ")[1].slice(0, 5);
      } catch (e) {}

      HTML += `
        <div class="historial-item">
          <div class="item-info">
            <span class="item-nombre" title="${reg.archivo}">${reg.archivo}</span>
            <span class="item-meta">${reg.notaria} | ${reg.volumen || "Sin Vol"} | ${reg.paginas} pág. | ${hora}</span>
          </div>
          <div class="item-status ${esSincronizado ? 'sincronizado' : 'pendiente'}" title="${textStatus}">
            <img src="${iconSrc}" style="filter: drop-shadow(0px 0px 1px ${iconColor}); vertical-align: middle; margin-right: 4px;" alt="Icono">
            <span>${esSincronizado ? 'Enviado' : 'Pendiente'}</span>
          </div>
        </div>
      `;
    });

    listaHistorial.innerHTML = HTML;

    if (lblPendientesAlerta) {
      if (pendientes > 0) {
        lblPendientesAlerta.textContent = `${pendientes} pendientes`;
        lblPendientesAlerta.style.display = "inline";
      } else {
        lblPendientesAlerta.style.display = "none";
      }
    }
  }

  await cargarYRenderizarHistorial();

  // 2. Vincular botón de regreso a captura
  if (btnRegresar) {
    btnRegresar.addEventListener("click", () => {
      window.apiElectron.regresarACaptura();
    });
  }

  // 3. IPC: Escuchar Nuevos PDFs Detectados en caliente
  window.apiElectron.alDetectarRegistro(async (nuevoRegistro) => {
    console.log("Historial detectó nuevo archivo en caliente:", nuevoRegistro.archivo);
    await cargarYRenderizarHistorial();
  });

  // 4. IPC: Escuchar Sincronizaciones Exitosas en caliente (desde cola de reintentos)
  window.apiElectron.alSincronizarRegistro(async (datos) => {
    console.log("Historial detectó sincronización exitosa en caliente:", datos.archivo);
    await cargarYRenderizarHistorial();
  });

  // 5. IPC: Escuchar Cambios de Conectividad con el Servidor
  window.apiElectron.alCambiarConexion((datos) => {
    if (!lblRed) return;
    if (datos.online) {
      lblRed.style.color = "var(--color-exito)";
      lblRed.innerHTML = `<img src="assets/wifi.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 3px;" alt="Online"> <span>Online</span>`;
    } else {
      lblRed.style.color = "var(--color-peligro)";
      lblRed.innerHTML = `<img src="assets/wifi-off.svg" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 3px;" alt="Offline"> <span>Offline</span>`;
    }
  });
});
