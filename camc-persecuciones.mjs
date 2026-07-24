import { ChaseState } from "./module/model/chase-state.mjs";
import { CAMCChaseHUD } from "./module/app/chase-hud.mjs";

const MODULE_ID = "camc-persecuciones";

let chaseHUDApp = null;

/**
 * Función global para abrir o alternar el HUD de Persecución.
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

// 1. INIT HOOK
Hooks.once("init", async () => {
  console.log(`CAMC Persecuciones | Inicializando módulo de Control Visual para Foundry VTT v13`);

  // Precargar la plantilla Handlebars
  await loadTemplates([
    `modules/${MODULE_ID}/templates/chase-hud.hbs`
  ]);

  // Registrar setting para guardar el estado del mundo
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

  // Registrar Keybinding (Atajo de teclado: Alt + P)
  game.keybindings.register(MODULE_ID, "toggleChaseHUDKey", {
    name: "Abrir/Cerrar Control de Persecuciones",
    hint: "Alterna la visibilidad de la ventana visual de persecuciones.",
    editable: [
      { key: "KeyP", modifiers: ["Alt"] }
    ],
    onDown: () => {
      toggleChaseHUD();
      return true;
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

// 2. READY HOOK
Hooks.once("ready", () => {
  // Sockets para sincronización en tiempo real
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

  Hooks.on("camcChaseStateChanged", () => {
    if (chaseHUDApp && chaseHUDApp.rendered) {
      chaseHUDApp.render(false);
    }
  });

  console.log(`CAMC Persecuciones | Listo. Puedes usar Alt+P o el botón de escena/hoja para abrir el panel.`);
});

// 3. BOTÓN EN LA BARRA DE HERRAMIENTAS DE ESCENA
Hooks.on("getSceneControlButtons", controls => {
  let tokenCategory = null;

  if (Array.isArray(controls)) {
    tokenCategory = controls.find(c => c.name === "tokens" || c.name === "token");
  } else if (controls && typeof controls === "object") {
    tokenCategory = controls.tokens || controls.token;
  }

  if (tokenCategory) {
    const tool = {
      name: "camc-persecuciones",
      title: "Control Visual de Persecuciones",
      icon: "fas fa-flag-checkered",
      visible: true,
      button: true,
      onClick: () => toggleChaseHUD(),
      onChange: (event, active) => { if (active) toggleChaseHUD(); }
    };

    if (Array.isArray(tokenCategory.tools)) {
      if (!tokenCategory.tools.some(t => t.name === "camc-persecuciones")) {
        tokenCategory.tools.push(tool);
      }
    } else if (tokenCategory.tools && typeof tokenCategory.tools === "object") {
      tokenCategory.tools["camc-persecuciones"] = tool;
    }
  }
});

// 4. BOTÓN EN LA CABECERA DE LAS HOJAS DE PERSONAJE Y MOTO
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  buttons.unshift({
    label: "Persecución",
    class: "camc-chase-header-btn",
    icon: "fas fa-flag-checkered",
    onclick: async () => {
      toggleChaseHUD();
      if (sheet.actor) {
        await ChaseState.addParticipant({ actor: sheet.actor, role: "evader" });
      }
    }
  });
});

export { ChaseState, CAMCChaseHUD, toggleChaseHUD };
