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

function openChaseHUD() {
  if (!chaseHUDApp) {
    chaseHUDApp = new CAMCChaseHUD();
  }
  chaseHUDApp.render(true);
}

// 1. INIT HOOK
Hooks.once("init", async () => {
  console.log(`CAMC Persecuciones | Inicializando módulo de Control Visual para Foundry VTT v13`);

  await loadTemplates([
    `modules/${MODULE_ID}/templates/chase-hud.hbs`
  ]);

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
      fase: "movimiento",
      participants: []
    }
  });

  const FormAppCls = foundry.appv1?.api?.FormApplication || FormApplication;
  class CAMCChaseHUDMenu extends FormAppCls {
    render() {
      toggleChaseHUD();
    }
  }

  game.settings.registerMenu(MODULE_ID, "openChaseHUDMenu", {
    name: "Control Visual de Persecuciones",
    label: "Abrir Control de Persecuciones",
    hint: "Abre la ventana interactiva del control visual de persecuciones en pantalla.",
    icon: "fas fa-flag-checkered",
    type: CAMCChaseHUDMenu,
    restricted: false
  });

  game.keybindings.register(MODULE_ID, "toggleChaseHUDKey", {
    name: "Abrir/Cerrar Control de Persecuciones",
    hint: "Alterna la visibilidad de la ventana de persecuciones.",
    editable: [{ key: "KeyP", modifiers: ["Alt"] }],
    onDown: () => {
      toggleChaseHUD();
      return true;
    }
  });

  const moduleObj = game.modules.get(MODULE_ID);
  if (moduleObj) {
    moduleObj.api = {
      ChaseState,
      CAMCChaseHUD,
      toggleHUD: toggleChaseHUD,
      openHUD: openChaseHUD,
      getHUD: () => chaseHUDApp
    };
  }
});

// 2. READY HOOK - SINCRONIZACIÓN Y APERTURA AUTOMÁTICA EN MULTIJUGADOR
Hooks.once("ready", () => {
  game.socket.on(`module.${MODULE_ID}`, async data => {
    if (!data || typeof data !== "object") return;

    if (data.type === "OPEN_CHASE_HUD_ALL") {
      openChaseHUD();
    } else if (data.type === "REFRESH_CHASE_HUD") {
      if (chaseHUDApp && chaseHUDApp.rendered) {
        chaseHUDApp.render(false);
      }
    } else if (data.type === "UPDATE_CHASE_STATE" && game.user.isGM) {
      await ChaseState.update(data.changes, { showToAll: data.showToAll });
    }
  });

  Hooks.on("camcChaseStateChanged", () => {
    if (chaseHUDApp && chaseHUDApp.rendered) {
      chaseHUDApp.render(false);
    }
  });

  console.log(`CAMC Persecuciones | Listo y sincronizado.`);
});

// 3. INTEGRACIÓN EN CONTROLES DE ESCENA
Hooks.on("getSceneControlButtons", controls => {
  const chaseCategory = {
    name: "camc-persecuciones",
    title: "Persecuciones",
    icon: "fas fa-flag-checkered",
    layer: "tokens",
    visible: true,
    tools: [
      {
        name: "chase-hud-toggle",
        title: "Control Visual de Persecuciones (CAMC)",
        icon: "fas fa-road",
        button: true,
        visible: true,
        onClick: () => toggleChaseHUD(),
        onChange: () => toggleChaseHUD()
      }
    ]
  };

  if (Array.isArray(controls)) {
    controls.push(chaseCategory);
    const tokenCategory = controls.find(c => c.name === "tokens" || c.name === "token");
    if (tokenCategory && Array.isArray(tokenCategory.tools)) {
      tokenCategory.tools.push({
        name: "camc-persecuciones-token-tool",
        title: "Control Visual de Persecuciones",
        icon: "fas fa-flag-checkered",
        button: true,
        visible: true,
        onClick: () => toggleChaseHUD(),
        onChange: () => toggleChaseHUD()
      });
    }
  } else if (controls && typeof controls === "object") {
    controls["camc-persecuciones"] = chaseCategory;
    if (controls.tokens || controls.token) {
      const tCat = controls.tokens || controls.token;
      if (tCat.tools && typeof tCat.tools === "object") {
        tCat.tools["camc-persecuciones-token-tool"] = {
          name: "camc-persecuciones-token-tool",
          title: "Control Visual de Persecuciones",
          icon: "fas fa-flag-checkered",
          button: true,
          visible: true,
          onClick: () => toggleChaseHUD(),
          onChange: () => toggleChaseHUD()
        };
      }
    }
  }
});

// 4. INTEGRACIÓN EN EL COMBAT TRACKER
Hooks.on("renderCombatTracker", (app, html) => {
  const root = html[0] || html;
  if (root.querySelector(".camc-chase-sidebar-btn")) return;

  const header = root.querySelector(".combat-tracker-header") || root.querySelector("header") || root;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "camc-chase-sidebar-btn";
  button.style.cssText = "margin: 6px 0; background: linear-gradient(180deg, #202729, #101415); border: 1px solid #02d6e7; color: #fff; font-family: CAMCHead, sans-serif; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; padding: 7px; border-radius: 4px; cursor: pointer; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.4);";
  button.innerHTML = '<i class="fas fa-flag-checkered" style="color: #02d6e7; font-size: 14px;"></i> Control de Persecución';
  button.addEventListener("click", () => toggleChaseHUD());

  if (header) {
    header.appendChild(button);
  }
});

// 5. BOTÓN EN LA CABECERA DE HOJAS DE PERSONAJE Y MOTO
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

export { ChaseState, CAMCChaseHUD, toggleChaseHUD, openChaseHUD };
