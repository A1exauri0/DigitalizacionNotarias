# Digitalización Notarías - Cliente de Escritorio (Electron)

Este proyecto es la aplicación cliente de digitalización desarrollada en **Electron** que reemplaza el cliente en C#. Se encarga de monitorear en caliente la carpeta de trabajo, contar las páginas físicas de los PDFs de forma optimizada y registrar la auditoría en tiempo real en el servidor central.

---

## Topología de Red y Arquitectura

* **Servidor Central (`ServidorNotarias`)**: Corre en la PC principal con la IP **`192.168.1.10`** (puerto `3000`).
* **Clientes de Digitalización (`DigitalizacionNotarias`)**: Corren en las diferentes PCs de la red (ej. `192.168.1.11`, `192.168.1.12`, etc.).
* **Unidad de Red Compartida**: Los capturistas guardan/escanean físicamente los PDFs de su trabajo directamente en una unidad de red compartida accesible por todas las máquinas.
* **Flujo de Auditoría**: Cuando el cliente detecta la caída de un nuevo PDF en su carpeta vigilada (dentro de la unidad de red), procesa la cantidad de páginas y envía una notificación HTTP POST al servidor central en `http://192.168.1.10:3000/api/registrar` para registrar el evento en MySQL. **No se realiza copia física de archivos por parte del servidor**, garantizando transacciones ultra rápidas en milisegundos.

---

## Características Clave

1. **Sin base de datos local**: Mantiene la cola de envío en memoria y reintenta de forma automática cada 15 segundos ante pérdidas de red.
2. **Widget Flotante**: Ventana compacta sin bordes y siempre visible que se posiciona en la esquina inferior derecha. Muestra el usuario activo, la ruta vigilada de red, el indicador de conexión (Online/Offline) y el contador de sesión.
3. **Conteo Ultrarrápido**: Algoritmo optimizado que lee los primeros y últimos 100 KB del búfer en búsqueda de la etiqueta `/Count`, resolviendo PDFs pesados en menos de 3 milisegundos.

---

## Instalación y Arranque

1. Instalar dependencias con `pnpm`:
   ```bash
   pnpm install
   ```
2. Iniciar la aplicación:
   ```bash
   pnpm start
   ```