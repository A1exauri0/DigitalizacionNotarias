/**
 * Utilidad de Conteo Rápido de Páginas PDF (contadorPaginas.js).
 * Intenta leer las páginas buscando la etiqueta /Count en la estructura del PDF (primeros/últimos 100 KB).
 * Hace un fallback asíncrono con pdf-lib si falla.
 */

const fs = require("fs").promises;
const { PDFDocument } = require("pdf-lib");

// Algoritmo rápido: Lee búferes parciales y busca con Regex la etiqueta /Count
async function contarPaginasRapido(rutaCompleta) {
  let fd;
  try {
    fd = await fs.open(rutaCompleta, "r");
    const stat = await fd.stat();
    const tamanio = stat.size;

    if (tamanio === 0) return 0;

    const TAMANIO_FRAGMENTO = Math.min(102400, tamanio); // 100 KB
    const bufferCabecera = Buffer.alloc(TAMANIO_FRAGMENTO);
    const bufferCola = Buffer.alloc(TAMANIO_FRAGMENTO);

    // 1. Leer los primeros 100 KB (Cabecera)
    await fd.read(bufferCabecera, 0, TAMANIO_FRAGMENTO, 0);
    const textoCabecera = bufferCabecera.toString("ascii");

    // 2. Leer los últimos 100 KB (Cola)
    await fd.read(bufferCola, 0, TAMANIO_FRAGMENTO, Math.max(0, tamanio - TAMANIO_FRAGMENTO));
    const textoCola = bufferCola.toString("ascii");

    const regex = /\/Type\s*\/Pages[\s\S]*?\/Count\s*(\d+)|\/Count\s*(\d+)[\s\S]*?\/Type\s*\/Pages/gi;
    let match;
    let paginasMaximas = 0;

    // Buscar en Cabecera
    while ((match = regex.exec(textoCabecera)) !== null) {
      const valor = parseInt(match[1] || match[2], 10);
      if (valor > paginasMaximas) paginasMaximas = valor;
    }

    // Buscar en Cola
    regex.lastIndex = 0; // Reiniciar índice de búsqueda
    while ((match = regex.exec(textoCola)) !== null) {
      const valor = parseInt(match[1] || match[2], 10);
      if (valor > paginasMaximas) paginasMaximas = valor;
    }

    return paginasMaximas;
  } catch (error) {
    console.error(`Error en conteo rápido de páginas para ${rutaCompleta}:`, error.message);
    return 0;
  } finally {
    if (fd) {
      try {
        await fd.close();
      } catch (e) {}
    }
  }
}

// Fallback robusto: Abre el archivo completo y cuenta con pdf-lib
async function contarPaginasConFallback(rutaCompleta) {
  try {
    const data = await fs.readFile(rutaCompleta);
    const pdfDoc = await PDFDocument.load(data, { 
      updateMetadata: false, 
      ignoreEncryption: true 
    });
    return pdfDoc.getPageCount();
  } catch (error) {
    console.error(`Error de fallback con pdf-lib en ${rutaCompleta}:`, error.message);
    return 1; // Fallback mínimo por defecto
  }
}

// Lógica principal unificada para obtener el total de páginas
async function obtenerPaginasPdf(rutaCompleta) {
  const paginasRapido = await contarPaginasRapido(rutaCompleta);
  if (paginasRapido > 0) {
    return paginasRapido;
  }
  return await contarPaginasConFallback(rutaCompleta);
}

module.exports = {
  obtenerPaginasPdf
};
