# 🦅 Plan Maestro: La Herramienta Definitiva para Supervisores
> **Visión:** Pasar de una "app de consulta" a un **Centro de Mando Integral**. El supervisor no debe "buscar" los problemas; la app debe mostrárselos antes de que ocurran.

## 1. Diagnóstico Actual (Supervisor Focus)
La app actualmente es una excelente *herramienta de consulta* (ver horarios, buscar trenes), pero carece de la **visión macro** necesaria para gestionar una red compleja en tiempo real.

*   **Visibilidad Macro:** ⭐⭐ (El supervisor debe entrar servicio por servicio para ver qué pasa)
*   **Gestión de Crisis:** ⭐⭐⭐ (Buena para incidencias puntuales, débil para colapsos múltiples)
*   **Comunicación:** ⭐ (Inexistente; no hay forma de avisar a 50 maquinistas a la vez)
*   **Base Técnica:** ⭐⭐⭐⭐ (Sólida tras la Fase 1: Modular y Tipada)

---

## 2. Hoja de Ruta Estratégica

### ✅ FASE 1: Cimientos de Roca (COMPLETADA)
*Infraestructura técnica para soportar carga masiva de datos sin fallos.*

- [x] **Refactoring `IncidenciaView`:** Modularización y limpieza de deuda técnica.
- [x] **Blindaje de Tipos:** Eliminación de errores en tiempo de ejecución.
- [x] **Error Boundaries:** Protección contra caídas de la app.

---

### 🔭 FASE 2: Dashboard "Ojo de Halcón" (Prioridad MÁXIMA)
*Objetivo: Situational Awareness. Entender el estado de TODA la red en 5 segundos.*

La app actual obliga al supervisor a navegar demasiado. Necesitamos una pantalla de inicio que sea un **Tablero de Control**.

- [ ] **Dashboard Principal (Grid Bento):**
    -   **KPIs en Tiempo Real:**
        -   *% Servicio Cubierto:* ¿Cuántos trenes están circulando vs programados?
        -   *Incidencias Activas:* Contador rojo parpadeante si hay problemas abiertos.
        -   *Retraso Promedio:* Termómetro de salud de la red.
    -   **Mini-Mapa de Calor:** Visualización rápida de zonas con problemas (sin cargar el mapa completo pesado).
    -   **Lista de "Atención Requerida":**
        -   Maquinistas que no han fichado.
        -   Trenes reportados averiados (`CiclesView` integration) asignados a servicio.

- [ ] **Widget de Disponibilidad:**
    -   Resumen rápido de personal de reserva (PC, Sabadell, Rubí) sin entrar a buscar uno a uno.

---

### 🛠️ FASE 3: Herramientas de Gestión Profunda (Control Total)
*Objetivo: Manipulación y Resolución. Pasar de "ver" a "actuar".*

- [ ] **Malla Interactiva (Evolución de OrganitzaView):**
    -   Transformar la lista estática en un **Gantt Interactivo**.
    -   Visualizar solapes de turnos y descansos en una línea de tiempo real.
    -   **Alertas Visuales:** Resaltar en rojo turnos que violan normativa de descanso (conflictos).

- [ ] **Integración Inteligente de Parque (CiclesView):**
    -   Si un tren se marca como "Averiado" en `CiclesView`, debe **bloquearse** automáticamente en `IncidenciaView`.
    -   Sistema de "Release": El taller marca un tren "Listo" y le aparece disponible al supervisor instantáneamente.

---

### 📢 FASE 4: Comunicación y Cierre (Inteligencia)
*Objetivo: Cerrar el bucle de información con el personal.*

- [ ] **Centro de Difusión (Broadcast):**
    -   Posibilidad de enviar notificaciones Push/In-App a grupos específicos:
        -   *"Atención maquinistas de S1: Retrasos por avería en Sarrià".*
        -   *"Turno de Tarde: Revisar nuevo gráfico".*
    -   Confirmación de lectura ("Recibido") para instrucciones críticas.

- [ ] **Reportes Automatizados:**
    -   **"Flash Report":** Generar PDF al finalizar el turno con un resumen de incidencias, kilómetros perdidos y personal utilizado. Evitar el reporteo manual.

---

## 🔔 Acción Inmediata: FASE 2
Comenzar con el diseño del **Dashboard "Ojo de Halcón"**. Es la pieza clave que cambiará la experiencia de usar "una app de horarios" a usar "una herramienta de supervisión profesional".
