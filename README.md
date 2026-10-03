# NetRebalance

NetRebalance es una aplicación web para el monitoreo y rebalanceo de portafolios de inversión. Permite registrar portafolios, configurar activos y sus pesos objetivo, consultar precios actualizados y evaluar si existe una oportunidad de rebalanceo considerando las desviaciones del portafolio y los costos asociados al broker.

## Funcionalidades principales

- Registro e inicio de sesión de usuarios.
- Gestión del perfil.
- Registro y configuración de brokers.
- Creación y configuración de portafolios.
- Gestión de activos, cantidades y pesos objetivo.
- Validación de que la distribución objetivo sea igual al 100%.
- Consulta de los últimos precios disponibles.
- Cálculo del valor y peso actual de cada activo.
- Identificación de desviaciones respecto a la distribución objetivo.
- Estimación del monto necesario para rebalancear.
- Evaluación de costos de comisión y spread.
- Recomendación de compra, venta o mantenimiento.

## Regla de rebalanceo

Para el MVP, NetRebalance considera que existe una oportunidad de rebalanceo cuando:

- Al menos un activo presenta una desviación absoluta de **5 puntos porcentuales o más** respecto a su peso objetivo.
- El costo estimado del rebalanceo no supera el **2% del monto total a redistribuir**.

La aplicación genera únicamente recomendaciones y no ejecuta operaciones financieras.

## Tecnologías

### Frontend
- Vue 3
- TypeScript
- Vite
- Tailwind CSS

### Backend y datos
- Supabase
- PostgreSQL
- Supabase Auth
- Row Level Security (RLS)

### Automatización e integración
- n8n
- Servicio externo de actualización de precios

## Arquitectura general

```text
Frontend Vue
     │
     ▼
Supabase
├── Authentication
├── PostgreSQL
├── RLS
└── Datos del portafolio
     │
     ├── Actualización de precios
     │
     └── n8n
          └── Evaluación y notificación
```

## Ejecución local

Instalar las dependencias:

```bash
npm install
```

Crear un archivo `.env` con:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Ejecutar el proyecto:

```bash
npm run dev
```

Para generar una versión de producción:

```bash
npm run build
```

## Estado del proyecto

NetRebalance se encuentra desarrollado como un MVP académico.

La aplicación permite completar el flujo principal de configuración y análisis de un portafolio. La automatización de notificaciones se integra mediante n8n.

## Autores

Proyecto desarrollado como parte de un trabajo académico de Ingeniería de Software.