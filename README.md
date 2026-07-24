# Cuervos de Asgard MC · Control Visual de Persecuciones

Módulo oficial adaptado para **Foundry VTT v13** que ofrece un HUD interactivo y visual para controlar persecuciones en pantalla según el manual oficial de **Cuervos de Asgard Motor Club**.

![Icono del Módulo](https://img.shields.io/badge/FoundryVTT-v13-orange)

## Qué ofrece este módulo

- **Pista Táctica de Franjas (1 a 10)**: Visualización longitudinal de carretera y yermos con muescas numéricas, indicador de inicio (Franja 1) y Zona de Huida (Franja 10).
- **Dashboard de Entorno**: Selección interactiva de Terreno (*Fácil 8, Media 10, Desafiante 13, Difícil 16, Muy difícil 20*) y Visibilidad (*Normal +0, Mala +2, Pésima +4*).
- **Cálculo Automático de Dificultad**: Muestra la Dificultad Base acumulada en pantalla en un badge iluminado de estilo velocímetro.
- **Participantes y Drag & Drop**:
  - Arrastra personajes o tokens al panel para añadirlos instantáneamente como **Perseguidos**.
  - Arrastra manteniendo la tecla `Shift` para añadirlos como **Perseguidores**.
- **Acciones Tácticas y Tiradas Integradas**:
  - Tiradas de Movimiento: *Cambiar de posición*, *Mantener posición*, *Obstaculizar*, *Quemar rueda*.
  - Avance automático de franjas al obtener éxitos en las tiradas.
  - Tiradas de Maniobra: *Atacar directo*, *Atacar estabilizando*, *Chocar*, *Embestir*.
- **Sincronización Multijugador**: Sincronización en tiempo real vía sockets entre el Director de Juego y los Jugadores.
- **Acceso Rápido**: Botón con icono de bandera a cuadros (`fas fa-flag-checkered`) en la barra de herramientas lateral de escena de Foundry VTT.

## Instalación

El módulo está instalado directamente en tu carpeta `Data/modules/camc-persecuciones`. En Foundry VTT solo debes activarlo desde la pestaña **Configuración → Gestionar módulos**.

## Autoría

Desarrollado por **Manu Romera** (Bruma's Rol).
