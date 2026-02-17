# Tareas del Proyecto CercaTorns Pro

## ✅ FASE 1: Cimientos de Roca (COMPLETADA)
- [x] **Refactoring IncidenciaView (Modularización)**
    - [x] Extraer `AlternativeServiceOverlay` (+1700 líneas)
    - [x] Reducir `IncidenciaView` (2072 -> 400 líneas)
    - [x] Implementar `ErrorBoundary` en sub-vistas
- [x] **Blindaje de Tipos**
    - [x] Crear interfaces `EnrichedShift`, `EnrichedDriver`, `RestingResult`, etc.
    - [x] Eliminar `any` en hooks críticos (`useCirculationSearch`, `useLiveMapData`)

## 🔭 FASE 2: Dashboard "Ojo de Halcón" (Supervisor First)
> Objetivo: Visibilidad total en tiempo real. Pasar de "buscar información" a "tener la información".

- [ ] **Diseño y Estructura del Dashboard**
    - [ ] Definir layout de "Grid Bento" (KPIs + Mapas + Listas)
    - [ ] Crear componentes de tarjeta (`StatCard`, `MiniMap`, `AlertList`)
- [ ] **KPIs en Tiempo Real**
    - [ ] Calcular % de Servicio Cubierto
    - [ ] Monitorizar Retraso Medio de la red
    - [ ] Contador de Incidencias Activas
- [ ] **Integración de Estado de Flota**
    - [ ] Widget de disponibilidad de trenes (desde `CiclesView`)
    - [ ] Alerta de "Trenes Bloqueados" asignados a servicio

## 🛠️ FASE 3: Herramientas de Gestión Profunda
> Objetivo: Manipulación directa y resolución de conflictos.

- [ ] **Malla Interactiva (Evolución OrganitzaView)**
    - [ ] Crear vista Gantt de turnos activos
    - [ ] Visualizador de conflictos de descanso (visual warnings)
- [ ] **Gestión de Reservas Inteligente**
    - [ ] Algoritmo de recomendación de reservas basado en proximidad (geo)
    - [ ] Panel de asignación rápida

## 📢 FASE 4: Comunicación y Reportes
> Objetivo: Cerrar el ciclo de información.

- [ ] **Centro de Mensajería (Broadcast)**
    - [ ] Envío de notificaciones a grupos (Línea Vallès, Llobregat, Turno Mañana)
- [ ] **Reportes Automáticos**
    - [ ] Generar PDF "Informe de Guardia" con un clic
    - [ ] Exportar estadísticas de incidencias CSV
