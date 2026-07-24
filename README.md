# Cuervos de Asgard MC · Control Visual de Persecuciones para Foundry VTT

> **Módulo Oficial para Foundry VTT v13.** Diseñado específicamente para integrarse con el sistema [Cuervos de Asgard Motor Club](https://github.com/ManuRomera/cuervos-de-asgard-mc). Permite controlar visualmente en pantalla las persecuciones de vehículos según el reglamento oficial del manual de juego.

Módulo nativo que añade una **Pista Táctica Nórdico-Motera** de 10 franjas con **Runas Elder Futhark**, consolas heroicas de tirada de dados, barra de fases de turno (Iniciativa, Declaración, Movimiento, Maniobra) y vinculación bidireccional entre Piloto y Moto con consumo automático de Maniobrabilidad y Daño de Estructura.

---

## ⚡ Instalación directa en Foundry VTT

En Foundry VTT ve a **Configuración → Módulos de juego → Instalar módulo** y pega esta URL en **URL del Manifiesto**:

```text
https://raw.githubusercontent.com/ManuRomera/camc-persecuciones/main/module.json
```

Foundry descargará e instalará el módulo automáticamente desde la última versión publicada y te notificará cuando haya actualizaciones.

---

## 🏆 Características principales

- **Pista Táctica Rúnica (Franjas 1 a 10)**:
  - Visualización horizontal de la carretera y yermos con runas Elder Futhark (`ᚠ Fehu` a `ᛖ Ehwaz / Valhalla`).
  - Posicionamiento en tiempo real de fichas de Cuervos a la Fuga (*Perseguidos* - resplandor cyber cyan) y la Amenaza (*Perseguidores* - resplandor cobre sanguíneo).
  - Zona de huida automática en la Franja 10.

- **Integración Multicanal en la Interfaz de Foundry VTT v13**:
  - **Barra de Herramientas de Escena** (izquierda): Categoría nativa dedicada `Persecuciones` 🏁.
  - **Combat Tracker** (panel lateral derecho): Botón `🏁 Control de Persecución` integrado en la cabecera.
  - **Ajustes del Módulo**: Registro formal en *Configuración de la partida*.
  - **Cabecera de Hojas de Personaje y Moto**: Botón directo `🏁 Persecución` junto a los controles de ventana.
  - **Atajo de Teclado**: `Alt + P` para alternar la visibilidad.

- **Difusión Multijugador Sincronizada**:
  - El Director de Juego dispone del botón **`📢 Mostrar a Todos`** para desplegar automáticamente la pantalla táctica en todos los jugadores conectados a la sesión.

- **Secuencia de Fases de Turno Guiada**:
  - `[ ᛏ 1. INICIATIVA ]` ➔ `[ ᚱ 2. DECLARACIÓN (Orden Inverso) ]` ➔ `[ ⚡ 3. MOVIMIENTO (Todos tiran) ]` ➔ `[ ⚔️ 4. MANIOBRAS Y ATAQUES ]`.

- **Vinculación Nativa Piloto ↔ Moto**:
  - Detecta automáticamente la moto vinculada (`system.mount.uuid`).
  - Muestra la **Barra de Estructura HP de la Moto**, **Bonificador de Maniobrabilidad (+X)** y la alerta **`⚠️ DAÑO GRAVE`** (-3 a todas las tiradas si la estructura cae al 50% o menos).

- **Automatización Completa de Reglas de `CONFIG.CAMC.persecucion`**:
  - **Movimiento**: *Cambiar de posición* (+0 Mod, avanza 1/2 franjas), *Mantener posición* (sin tirada), *Obstaculizar* (+2 Mod, impone +3/+6 a perseguidores), *Quemar rueda* (+4 Mod, avanza 2/3 franjas).
  - **Maniobras**: *Embestir*, *Arrollar*, *Sacar de la carretera*, *Evadirse*, *Atacar directo*, *Atacar estabilizando* y *Chocar directamente*.
  - Lanzamiento de dados 3D nativos y descuento directo de daño en Estructura de moto o Salud de personajes.

---

## 📊 Compatibilidad

| Módulo | Foundry VTT mínimo | Foundry VTT verificado | Sistema requerido |
|---|---|---|---|
| **v1.0.7** | **v13** | **v13.351** | **`cuervos-de-asgard-mc` v1.3.0+** |

---

## 🔗 Repositorio, Releases y Manifiesto

- **Manifest URL (para instalar en Foundry)**:
  ```text
  https://raw.githubusercontent.com/ManuRomera/camc-persecuciones/main/module.json
  ```
- **Repositorio GitHub**: [https://github.com/ManuRomera/camc-persecuciones](https://github.com/ManuRomera/camc-persecuciones)
- **Últimas Releases**: [https://github.com/ManuRomera/camc-persecuciones/releases](https://github.com/ManuRomera/camc-persecuciones/releases)

---

## 👥 Autoría y comunidad

Módulo desarrollado por **Manu Romera**, miembro de **Bruma's Rol**, diseñado para potenciar las partidas de **Cuervos de Asgard Motor Club** (Premio HazRol 2025 al *Mejor Juego de Rol Original en Castellano*).

---

## ⚖️ Aviso legal

Este paquete es un módulo complementario no oficial para uso en Foundry VTT. El código de integración se distribuye bajo licencia de código abierto.
