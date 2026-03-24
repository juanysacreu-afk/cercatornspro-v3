# 🦅 NEXUS: Plataforma de Gestió Ferroviària Integral (BV-FGC)

Aquest document detalla totes les funcionalitats, pantalles i mòduls del projecte **NEXUS** per a la seva càrrega a **Google NotebookLM**. NEXUS és la eina central per als supervisors de la xarxa ferroviària de FGC, dissenyada per al control total del personal, la flota i les incidències.

---

## 1. 👁️ CSO (Centre de Supervisió Operativa) - Dashboard
La pantalla principal d'entrada per a la supervisió en temps real.

### 1.1 KPIs d'Estat del Sistema
- **Cobertura de Servei**: Percentatge de circulacions teòriques que tenen una unitat de tren i un maquinista assignat en el moment actual.
- **Planificació Diària**: Percentatge de torns de personal coberts respecte al total requerit.
- **Reserves Disponibles**: Número de maquinistes de recanvi lliures als diferents destacaments (PC, SR, NA, PN, etc.).
- **Flota Operativa**: Total d'unitats de tren disponibles (restrant les que estan en avaria).

### 1.2 Atenció Requerida (Alertes)
- Sistema d'alertes crítiques i avisos en temps real (via Supabase Realtime).
- Notifica **torns sense maquinista**, **inicis de torn pendents**, **unitats amb avaria crítica** i qualsevol anomalia en la programació.

### 1.3 Cobertura de Xarxa
- Gràfic de barres interactiu que mostra els trens actius per línia (S1, S2, L6, L7, L12).

### 1.4 Mode Monitor
- Visualització optimitzada per a pantalles grans a la sala de control, eliminant menús i centrant-se en les dades vitals.

---

## 2. 🔍 CERCAR (Búsqueda Intel·ligent)
Cercador avançat per localitzar qualsevol recurs del sistema.

### 2.1 Cercar per Torn
- Localització de torns de personal (ex: Q0021). Mostra el cronograma complet, circulacions assigned i maquinista actual.

### 2.2 Cercar per Maquinista
- Cerca per nom, cognoms o nòmina. Mostra el torn assignat avui i dades de contacte.

### 2.3 Cercar per Circulació
- Cerca per codi de tren (ex: 12345). Mostra l'itinerari, parades, horaris de pas i via d'entrada.

### 2.4 Cercar per Estació
- Mostra el llistat de totes les circulacions que passen per una estació en una franja horària determinada, incloent la via ocupada.

### 2.5 Cercar per Cicle (Unitats)
- Localització de tota la feina assignada a una unitat física de tren o cicle de rotació.

### 2.6 Cercar per PK (Punt Kilomètric)
- Conversió de PK a coordenades geogràfiques i visualització al mapa. Permet buscar estacions per PK o Pks concrets.

---

## 3. 🔄 ORGANITZA (Gestió de Malla i Personal)
Mòdul per coordinar el personal i analitzar solapaments de horari.

### 3.1 Comparador de Torns
- Permet comparar fins a 4 torns simultàniament en un timeline visual.
- **Coincidències de Torns**: Calcula automàticament en quines estacions i a quina hora coincideixen dos maquinistes (ideal per gestionar relleus o trobades).

### 3.2 Gestió de Maquinistes
- Llistat complet de la plantilla assignada avui.
- **Filtres Avançats**: DIS (Disponible), DES (Descans), FOR (Formació), VAC (Vacances), DAG (Dies assumptes propis), etc.
- Accés immediat a telèfon i email del personal.

### 3.3 Organitza Malla (Gantt)
- Visualitzador tipus Gantt de tota la programació de serveis per detectar buits o solapaments en la malla ferroviària.

---

## 4. 🛡️ INCIDÈNCIA (Gestió de Crisi)
El cor de l'aplicació per a la resolució de problemes a la línia.

### 4.1 Per Circulació (Incidència de Tren)
- Identificació d'un tren afectat per avaria o indisposició.
- **Eines de Cobertura**: Busca automàticament personal de reserva proper, personal en viatger (passatgers) que pugui conduir, o personal en descans extensible.

### 4.2 Per Línia / Tram (Esquema Interactiu i Talls)
- **Mapa Ferroviari Interactiu**: Visualització de tota la línia amb estacions i talls de via.
- **Gestió de Talls**: El supervisor pot "tallar" una estació o un tram de via manualment al mapa.
- **Trens Atrapats**: El sistema identifica immediatament quins trens i maquinistes han quedat aïllats o atrapats dins de la zona de tall.

### 4.3 Gestió de Servei Alternatiu (Illa Logística)
- Davant un tall, permet organitzar la circulació restablerta a cada costat del tall (Illes).
- Gestió de circulacions creades "ad-hoc", torns especials i unitats de tren disponibles en cada sector aïllat.

### 4.4 Cobertura per Torn
- Eina per cobrir un torn sencer que ha quedat buit, utilitzant fragments de temps (buits) d'altres torns existents.

---

## 5. 🚆 UNITATS (Gestió de Flota)
Control de les unitats de tren i el seu estat mecànic.

### 5.1 Gestió d'Unitats (Fleet)
- Assignació d'unitats físiques (ex: 112.01) als cicles de treball.
- **Estat de la Unitat**: Marcatge de **Avaries**, necessitat d'imatges, registres o neteja.

### 5.2 Gestió de Dipòsits
- Visualització de trens aparcats (Parked Units) als dipòsits de Rubí, Plaça Catalunya, Terrassa, Sabadell, etc., amb control de via i capacitat.

### 5.3 Gestió d'Avaries i Manteniment
- Panell d'alertes de manteniment segons kilometratge o estat notificat.

### 5.4 Gestió de Kilòmetres
- Registre històric de kilometres recorreguts per cada unitat per a control de revisions.

---

## 6. 💬 MISSATGES (Comunicació Integrada)
Centre de missatgeria per a la coordinació del staff.

### 6.1 Chat Integrat amb Telegram
- Connexió amb el grup oficial de Telegram de Supervisors.
- Enviament de text, **fitxers adjunts**, imatges i **avisos d'alerta**.
- Tipus de missatge "Alerta" amb visualització diferenciada (taronja) per a notificacions crítiques.
- Reaccions amb emojis i missatges fixats (pins).

---

## 7. ⚙️ AJUSTOS I SISTEMA
Configuració i utilitats globals.

### 7.1 Menú d'Ajustos
- **Tema Visual**: Mode fosc (Dark Mode) i mode clar.
- **Navegació**: Opció de menú superior o barra lateral (ProNav) per a producció en PC.
- **Sons**: Gestió dels efectes de so de l'aplicació (sons premium).
- **Perfil**: Gestió de dades de l'usuari (nom, rol, correu).

### 7.2 Gestió de Calendari de Servei
- Administrador per gestionar els codis de servei (0, 100, 400, 500) segons el dia del calendari (festius, especials, etc.).

### 7.3 Càrrega de Dades (Plantejament)
- Eina de càrrega per importar el PDF diari de programació de FGC, que alimenta automàticament totes les taules de Supabase del projecte.

---

## 8. 🛠️ TECNOLOGIES PRINCIPALS
- **Frontend**: React + TypeScript + Vite.
- **Estils**: Tailwind CSS amb estètica Premium/Glassmorphism.
- **Base de Dades**: Supabase (PostgreSQL + Realtime).
- **Iconografia**: Lucide React.
- **Offline**: Sistema de sincronització de dades local per treballar sense connexió.
