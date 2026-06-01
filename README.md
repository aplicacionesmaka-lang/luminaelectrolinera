# ⚡ Lumina — Plataforma de Carga EV para Colombia

Stack completo: Backend Node.js · OCPP 1.6J · Firebase · Wompi/Stripe · App React Native · Dashboard React

---

## Estructura

```
lumina/
├── backend/          Node.js + Express + OCPP 1.6J WebSocket
├── mobile-app/       React Native (Expo) — App para conductores
└── dashboard/        React + Vite — Panel de administración
```

---

## Backend

### Requisitos
- Node.js 18+
- Cuenta Firebase (Firestore habilitado)
- Credenciales Wompi (sandbox o producción)

### Setup

```bash
cd backend
cp .env.example .env      # llena las variables
npm install
node src/index.js
```

### Variables de entorno principales (`.env`)

| Variable | Descripción |
|---|---|
| `FIREBASE_PROJECT_ID` | ID del proyecto Firebase |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Llave privada service account |
| `JWT_SECRET` | Secreto para firmar tokens JWT |
| `WOMPI_PUBLIC_KEY` | Llave pública Wompi |
| `WOMPI_PRIVATE_KEY` | Llave privada Wompi (para hash integridad) |
| `WOMPI_EVENTS_SECRET` | Secreto para verificar webhooks Wompi |
| `STRIPE_SECRET_KEY` | Llave secreta Stripe (fallback) |
| `STRIPE_WEBHOOK_SECRET` | Secreto webhook Stripe |
| `PRICE_PER_KWH` | Precio por kWh en COP (default: 1200) |
| `MIN_BALANCE` | Saldo mínimo para iniciar carga en COP (default: 500) |

### Endpoints REST

```
POST   /api/users/register
POST   /api/users/login
GET    /api/users/me
GET    /api/users/balance

GET    /api/stations
GET    /api/stations/:id
POST   /api/stations              (admin)
PUT    /api/stations/:id          (admin)

GET    /api/chargers
GET    /api/chargers/:id
POST   /api/chargers              (admin)
POST   /api/chargers/:id/start
POST   /api/chargers/:id/stop
GET    /api/chargers/:id/session

GET    /api/sessions/my
GET    /api/sessions              (admin)
GET    /api/sessions/summary      (admin)
GET    /api/sessions/:id

POST   /api/payments/topup
GET    /api/payments/history
POST   /api/payments/webhook/wompi
POST   /api/payments/webhook/stripe
```

### OCPP WebSocket

```
ws://host:4000/ocpp/{chargePointId}
Subprotocolo: ocpp1.6
```

Mensajes soportados: `BootNotification`, `Heartbeat`, `Authorize`, `StatusNotification`, `MeterValues`, `StartTransaction`, `StopTransaction`

---

## App Móvil

```bash
cd mobile-app
npm install
npx expo start
```

Crea `.env` o exporta:
```
EXPO_PUBLIC_API_URL=http://TU_IP:4000/api
EXPO_PUBLIC_PRICE_KWH=1200
```

**Pantallas:** Login · Registro · Lista de estaciones · Detalle + Iniciar/Detener carga · Historial · Perfil · Recarga de saldo

---

## Dashboard Admin

```bash
cd dashboard
npm install
npm run dev      # http://localhost:3001
```

Crea `.env`:
```
VITE_API_URL=http://localhost:4000/api
```

Acceso solo para usuarios con `role: admin`. Configura un usuario admin directamente en Firestore (`users/{uid}.role = "admin"`).

**Páginas:** Dashboard con métricas y gráficas · Gestión de estaciones · Historial de sesiones

---

## Colecciones Firestore

| Colección | Descripción |
|---|---|
| `users` | Conductores y admins, incluye `balance`, `idTag` |
| `stations` | Estaciones con ubicación y chargers anidados |
| `chargers` | Cargadores físicos con `chargePointId` OCPP |
| `sessions` | Sesiones de carga con kWh y costo calculado |
| `payments` | Recargas de saldo (Wompi/Stripe) |

---

## Cargador físico soportado

**HT-ED-120-C** (120 kW DC) — protocolo OCPP 1.6J sobre WebSocket.

Configura la URL del servidor OCPP en el cargador:
```
ws://TU_SERVIDOR:4000/ocpp/CP001
```
