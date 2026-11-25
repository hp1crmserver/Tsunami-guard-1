# Tsunami Guard (v1.0.0)

Sistema internacional de monitoreo de alertas, avisos y boletines de tsunami en tiempo real (PTWC, NTWC, NWS CAP, JMA, USGS, EMSC y GeoNet) con capas cartográficas Esri, notificaciones visuales/auditivas, generador gráfico 4:5, historial filtrable y exportación en PDF e imagen PNG.

---

## Opción 1: Subir a GitHub y desplegar directo en tu VPS (Recomendada)

Al usar `git clone` en tu VPS nunca se pierden archivos ocultos ni el `Dockerfile`.

### 1. Subir el código a tu repositorio de GitHub
Desde la carpeta del proyecto en tu PC (o descomprimiendo el ZIP):
```bash
git init
git add .
git commit -m "Initial release: Tsunami Guard v1.0.0"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/tsunami-guard.git
git push -u origin main
```

### 2. Desplegar en tu VPS Debian + CasaOS (por terminal / SSH)
```bash
cd /DATA/AppData/monitor
git clone https://github.com/TU_USUARIO/tsunami-guard.git
cd tsunami-guard
docker compose up -d --build
```
La aplicación quedará disponible en **`http://IP_DE_TU_VPS:3050`**.

Para actualizar en el futuro tras hacer cambios en GitHub:
```bash
cd /DATA/AppData/monitor/tsunami-guard
git pull && docker compose up -d --build
```

---

## Opción 2: Importar directo en la interfaz web de CasaOS (vía GitHub Container Registry)

Este repositorio incluye `.github/workflows/docker-publish.yml`. Cada vez que haces `git push` a `main`:
1. GitHub Actions verifica automáticamente TypeScript (`npm run lint`) y la compilación (`npm run build`).
2. Publica una imagen Docker lista para `amd64` y `arm64` en `ghcr.io/TU_USUARIO/tsunami-guard:latest` *(asegúrate de marcar el paquete en GitHub Packages como **Public** o iniciar sesión en Docker)*.
3. En **CasaOS → App Store → Custom Install → Import**, pega el contenido de [`docker-compose.casaos.yml`](./docker-compose.casaos.yml) reemplazando `TU_USUARIO_GITHUB` por tu usuario de GitHub.

---

## Requisitos y Notas
- **Sin base de datos ni variables secretas**: Funciona de inmediato; solo requiere salida HTTPS (puerto 443) desde el VPS hacia las agencias meteorológicas y servidores de mapas Esri.
- **Despliegue en subruta (ej. `https://tu-dominio.org/tsunamiguard/`)**: La aplicación usa rutas relativas (`base: './'`) y soporta proxies inversos automáticamente (tanto si el proxy elimina el prefijo `/tsunamiguard` como si lo mantiene).
  - En **Nginx / Nginx Proxy Manager**, usa la barra final en ambos lados (`location /tsunamiguard/` y `proxy_pass http://IP_VPS:3050/;`) o define `BASE_PATH=/tsunamiguard` en `docker-compose.yml`.
- **Zona horaria**: La interfaz utiliza automáticamente la zona horaria local del navegador donde se abre.
- **Notificaciones de escritorio**: Para usarlas fuera de `localhost`, coloca un proxy HTTPS (Nginx Proxy Manager o Caddy en CasaOS) apuntando al puerto `3050`.
