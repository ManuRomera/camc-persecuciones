import { ChaseState } from "./module/model/chase-state.mjs";
import { CAMCChaseHUD } from "./module/app/chase-hud.mjs";

const MODULE_ID = "camc-persecuciones";

let chaseHUDApp = null;

/**
 * Función para abrir o alternar la visibilidad del HUD de Persecución.
 */
function toggleChaseHUD() {
  if (!chaseHUDApp) {
    chaseHUDApp = new CAMCChaseHUD();
  }

  if (chaseHUDApp.rendered) {
    chaseHUDApp.close();
  } else {
    chaseHUDApp.render(true);
  }
}

// REGISTRO EN INIT HOOK
Hooks.once("init", () => {
  console.log(`CAMC Persecuciones | Inicializando módulo de Control Visual para Foundry VTT v13`);

  // Registrar setting para guardar el estado persistente del mundo
  game.settings.register(MODULE_ID, ChaseState.SETTING_KEY, {
    name: "Estado Activo de Persecución",
    scope: "world",
    config: false,
    type: Object,
    default: {
      active: false,
      title: "Persecución en las Llanuras Yermas",
      terreno: "media",
      visibilidad: "normal",
      franjasMax: 10,
      turno: 1,
      fase: "iniciativa",
      participants: []
    }
  });

  // Exponer API del módulo globalmente
  const moduleObj = game.modules.get(MODULE_ID);
  if (moduleObj) {
    moduleObj.api = {
      ChaseState,
      CAMCChaseHUD,
      toggleHUD: toggleChaseHUD,
      getHUD: () => chaseHUDApp
    };
  }
});

// CONFIGURACIÓN DE SOCKETS Y REFRESH EN READY HOOK
Hooks.once("ready", () => {
  // Listener de sockets de Foundry para sincronización GM-Jugadores
  game.socket.on(`module.${MODULE_ID}`, async data => {
    if (!data || typeof data !== "object") return;

    if (data.type === "REFRESH_CHASE_HUD") {
      if (chaseHUDApp && chaseHUDApp.rendered) {
        chaseHUDApp.render(false);
      }
    } else if (data.type === "UPDATE_CHASE_STATE" && game.user.isGM) {
      await ChaseState.update(data.changes);
    }
  });

  // Listener para refrescar la ventana cuando cambia el estado
  Hooks.on("camcChaseStateChanged", () => {
    if (chaseHUDApp && chaseHUDApp.rendered) {
      chaseHUDApp.render(false);
    }
  });

  console.log(`CAMC Persecuciones | Listo y sincronizado en tiempo real.`);
});

// BOTÓN EN LA BARRA DE HERRAMIENTAS DE ESCENA (LEFT TOOLBAR)
Hooks.on("getSceneControlButtons", controls => {
  const tokenControls = controls.find(c => c.name === "token");
  if (tokenControls) {
    tokenControls.tools.push({
      name: "camc-persecuciones-toggle",
      title: "Control Visual de Persecuciones (CAMC)",
      icon: "fas fa-flag-checkered",
      visible: true,
      onClick: () => toggleChaseHUD(),
      button: true
    });
  }
});

export { ChaseState, CAMCChaseHUD, toggleChaseHUD };
