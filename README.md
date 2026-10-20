# Queclink @Track Decoder

Decodificador de tramas ASCII del protocolo **Queclink @Track** que corre por completo en el navegador. Pegas una trama (`+RESP`, `+BUFF`, `+ACK`, `+SACK`) y ves cada campo con su nombre, su valor interpretado y la posición en el mapa.

**Modelos soportados**

| Modelo   | Protocolo | Versión de protocolo en la trama |
|----------|-----------|----------------------------------|
| GV350CEU | v13.06 (compatible desde v09.04) | `74XXYY`, p. ej. `740D01` |
| GV58CG   | v1.20     | `802003XXYY`, p. ej. `8020030C02` |

El modelo se detecta automáticamente a partir de la versión de protocolo; también puedes elegirlo en la barra superior o con la URL (`#gv350ceu`, `#gv58cg`).

## Funciones

- Decodificación campo por campo de FRI/ERI (incluye varias posiciones por trama y accesorios Bluetooth), alarmas, eventos, mensajes de información y acuses.
- Validación: avisa si a la trama le faltan campos o le sobran respecto al protocolo.
- Los mensajes sin definición propia se muestran campo por campo, y su bloque GNSS se detecta automáticamente.
- Mapa (OpenStreetMap), enlaces a Google Maps, exportación a JSON o tabla e historial local.
- Varias tramas a la vez, separadas por `$` o por salto de línea.
- Las tramas no salen de tu navegador: no hay servidor ni analítica.

## Uso local

No necesita compilación ni dependencias. Abre `index.html` en el navegador o sirve la carpeta:

```bash
python -m http.server 8000
# http://localhost:8000
```

## Estructura

```
index.html            Interfaz
assets/app.css        Estilos (claro/oscuro)
assets/core.js        Motor común: lector de campos, bloque GNSS, mensajes @Track compartidos, render y UI
models/gv350ceu.js    Definiciones y ejemplos del GV350CEU
models/gv58cg.js      Definiciones y ejemplos del GV58CG
test/run.js           Decodifica todos los ejemplos y falla si hay campos faltantes o sobrantes
docs/                 Notas sobre la documentación (los PDFs de Queclink no se publican)
```

## Agregar un modelo

1. Copia `models/gv58cg.js` como `models/<modelo>.js`.
2. Ajusta `id`, `name`, `protocol` y `deviceTypes`, que es el prefijo de *Full Protocol Version* que identifica al equipo.
3. Define lo que cambie respecto a los mensajes comunes de `assets/core.js`:
   - `fri.telemetry` / `fri.tail`: los campos después del bloque GNSS en FRI/ERI.
   - `fri.eri(c, mask)`: los bloques opcionales de ERI.
   - `specs` (mensajes con GNSS) e `info` (mensajes sin GNSS): sobrescriben las definiciones comunes.
   - `messages`: descripciones de mensajes nuevos.
4. Agrega ejemplos copiados del manual del modelo en `examples`.
5. Incluye el script en `index.html` (`<script src="models/<modelo>.js"></script>`) y ejecuta `node test/run.js`.

## Tests

```bash
node test/run.js
```

GitHub Actions los ejecuta en cada push (`.github/workflows/test.yml`).

## Limitaciones conocidas

- Solo se interpreta el formato ASCII; el formato HEX no está soportado.
- Los datos CAN dentro de ERI dependen de la configuración de `AT+GTCAN`, así que se muestran sin interpretar.
- GV58CG: el bloque Bluetooth de ERI se decodifica con la estructura del GV350CEU, y el ejemplo del manual no coincide del todo. Conviene verificarlo con tramas reales.

## Aviso

Proyecto independiente, sin relación con Queclink Wireless Solutions. Los nombres de producto pertenecen a sus dueños. Las definiciones de campos se escribieron a partir de los manuales @Track del fabricante, que no se distribuyen en este repositorio.

## Licencia

[MIT](LICENSE)
