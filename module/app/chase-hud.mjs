import { ChaseState } from "../model/chase-state.mjs";

const ApplicationV1 = foundry.appv1?.api?.Application || Application;

/**
 * HUD interactivo Rúnico-Motero para el Control de Persecuciones en Cuervos de Asgard MC.
 */
export class CAMCChaseHUD extends ApplicationV1 {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "camc-chase-hud",
      classes: ["camc", "camc-chase-window", "camc-runic-theme"],
      title: "ᚱ Control Visual de Persecuciones · Cuervos de Asgard ᛏ",
      template: "modules/camc-persecuciones/templates/chase-hud.hbs",
      width: 1080,
      height: 820,
      resizable: true,
      minimizable: true
    });
  }

  async getData(options) {
    const data = await super.getData(options);
    const state = ChaseState.get();
    const isGM = game.user.isGM;
    const baseDifficulty = ChaseState.getBaseDifficulty(state);

    const config = CONFIG.CAMC?.persecucion || {};
    const terrenos = (config.terrenos || []).map(t => ({
      ...t,
      selected: t.key === state.terreno
    }));
    const visibilidad = (config.visibilidad || []).map(v => ({
      ...v,
      selected: v.key === state.visibilidad
    }));

    const maxFranjas = state.franjasMax || 10;
    const franjasRunicas = [];

    for (let f = 1; f <= maxFranjas; f++) {
      const runeObj = ChaseState.FRANJA_RUNES.find(r => r.num === f) || { rune: "ᚱ", label: "" };
      const pursuers = state.participants.filter(p => p.role === "pursuer" && p.franja === f);
      const evaders = state.participants.filter(p => p.role === "evader" && p.franja === f);

      franjasRunicas.push({
        numero: f,
        rune: runeObj.rune,
        label: runeObj.label,
        isEscape: f === maxFranjas,
        isStart: f === 1,
        pursuers,
        evaders
      });
    }

    const enrichedParticipants = await Promise.all(state.participants.map(async p => {
      const actor = await this._getActor(p.actorUuid);
      return {
        ...p,
        actor,
        isControlled: actor ? actor.isOwner : isGM
      };
    }));

    const perseguidores = enrichedParticipants.filter(p => p.role === "pursuer");
    const perseguidos = enrichedParticipants.filter(p => p.role === "evader");

    return {
      ...data,
      state,
      isGM,
      baseDifficulty,
      terrenos,
      visibilidad,
      franjasRunicas,
      perseguidores,
      perseguidos
    };
  }

  /**
   * Obtención ultra-robusta de actores de Foundry VTT por UUID o ID.
   */
  async _getActor(uuidOrId) {
    if (!uuidOrId) return null;
    try {
      if (uuidOrId.startsWith("Actor.") || uuidOrId.startsWith("Compendium.") || uuidOrId.startsWith("Scene.")) {
        const doc = await fromUuid(uuidOrId);
        return doc?.actor || doc;
      }
    } catch (e) {
      // Ignorar fallo de fromUuid y reintentar con game.actors
    }
    return game.actors?.get(uuidOrId) || game.actors?.find(a => a.uuid === uuidOrId || a.id === uuidOrId) || null;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const container = html[0] || html;
    const isGM = game.user.isGM;

    container.addEventListener("dragover", ev => ev.preventDefault());
    container.addEventListener("drop", ev => this._onDrop(ev));

    container.querySelector(".btn-show-all")?.addEventListener("click", async () => {
      await ChaseState.showToAllPlayers();
      ui.notifications.info("📢 Pantalla de persecución enviada a todos los jugadores.");
    });

    // Cambio de fase
    container.querySelectorAll(".phase-step").forEach(step => {
      step.addEventListener("click", async ev => {
        if (!isGM) return;
        const newPhase = ev.currentTarget.dataset.fase;
        await ChaseState.update({ fase: newPhase });
      });
    });

    if (isGM) {
      container.querySelectorAll(".change-terreno").forEach(select => {
        select.addEventListener("change", async ev => {
          await ChaseState.update({ terreno: ev.target.value });
        });
      });

      container.querySelectorAll(".change-visibilidad").forEach(select => {
        select.addEventListener("change", async ev => {
          await ChaseState.update({ visibilidad: ev.target.value });
        });
      });

      container.querySelector(".btn-next-turn")?.addEventListener("click", async () => {
        const state = ChaseState.get();
        await ChaseState.update({ turno: state.turno + 1, fase: "movimiento" });
        ui.notifications.info(`Persecución: Inicio del Turno ${state.turno + 1}`);
      });

      container.querySelector(".btn-reset-chase")?.addEventListener("click", async () => {
        const confirm = await Dialog.confirm({
          title: "Reiniciar Persecución",
          content: "<p>¿Estás seguro de reiniciar la persecución?</p>"
        });
        if (confirm) {
          await ChaseState.update({ turno: 1, fase: "iniciativa" });
        }
      });
    }

    container.querySelectorAll(".btn-move-franja").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        const delta = Number(ev.currentTarget.dataset.delta);
        await ChaseState.setParticipantFranja(id, delta);
      });
    });

    container.querySelectorAll(".btn-remove-participant").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        await ChaseState.removeParticipant(id);
      });
    });

    container.querySelectorAll(".btn-toggle-role").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        const state = ChaseState.get();
        const p = state.participants.find(x => x.id === id);
        if (p) {
          p.role = p.role === "pursuer" ? "evader" : "pursuer";
          await ChaseState.update({ participants: state.participants });
        }
      });
    });

    // BOTONES DIRECTOS DE TIRADA DE MOVIMIENTO (PERSEGUIDORES Y PERSEGUIDOS)
    container.querySelectorAll(".btn-roll-mov-direct").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        const select = container.querySelector(`select.mov-action-select[data-id="${id}"]`);
        const actionKey = select ? select.value : "cambiar_posicion";
        await this._executeMovementRoll(id, actionKey);
      });
    });

    // BOTONES DIRECTOS DE TIRADA DE MANIOBRA (PERSEGUIDORES Y PERSEGUIDOS)
    container.querySelectorAll(".btn-roll-man-direct").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        const select = container.querySelector(`select.man-action-select[data-id="${id}"]`);
        const maneuverKey = select ? select.value : "atacar_directo";
        await this._executeManeuverRoll(id, maneuverKey);
      });
    });
  }

  async _onDrop(event) {
    event.preventDefault();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (e) {
      return;
    }

    let actor = null;
    if (data.type === "Actor") {
      actor = await this._getActor(data.uuid);
    } else if (data.type === "Token") {
      const token = await fromUuid(data.uuid);
      actor = token?.actor;
    }

    if (actor) {
      const role = event.shiftKey ? "pursuer" : "evader";
      await ChaseState.addParticipant({ actor, role, franja: role === "pursuer" ? 1 : 2 });
    }
  }

  async _executeMovementRoll(participantId, actionKey) {
    const state = ChaseState.get();
    const p = state.participants.find(x => x.id === participantId);
    if (!p) return;

    const actor = await this._getActor(p.actorUuid);
    if (!actor) {
      ui.notifications.error(`No se encontró el actor para ${p.name}`);
      return;
    }

    const baseDiff = ChaseState.getBaseDifficulty(state);
    const movConfig = CONFIG.CAMC?.persecucion?.movimiento?.find(m => m.key === actionKey);
    const actionMod = movConfig?.mod ?? 0;

    if (actionKey === "mantener_posicion") {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div class="camc-chat-card">
            <header>
              <h3><i class="fas fa-tachometer-alt"></i> Movimiento Rúnico</h3>
              <strong>${actor.name} (${p.role === "pursuer" ? "Perseguidor" : "Perseguido"})</strong>
            </header>
            <p><b>Mantener posición:</b> Conserva la Franja ${p.franja} sin realizar tirada.</p>
          </div>
        `
      });
      return;
    }

    const finalDifficulty = baseDiff + actionMod + (p.obstaculizadoMod || 0);

    // Obtener clase de tiradas del sistema CAMC
    let YsystemDiceCls = game.camc?.dice || game.cuervosDeAsgard?.dice;
    if (!YsystemDiceCls) {
      try {
        const mod = await import("/systems/cuervos-de-asgard-mc/module/dice/ysystem-dice.mjs");
        YsystemDiceCls = mod.YsystemDice;
      } catch (e) {
        console.error("CAMC Persecuciones | Error importando YsystemDice:", e);
      }
    }

    let mountActor = null;
    if (p.mount?.uuid) {
      mountActor = await this._getActor(p.mount.uuid);
    }

    let result = null;

    if (mountActor && game.cuervosDeAsgard?.CAMCMountRolls) {
      result = await game.cuervosDeAsgard.CAMCMountRolls.rollDrive(actor, mountActor, {
        label: `Persecución (${p.role === "pursuer" ? "Perseguidor" : "Perseguido"}): ${movConfig?.label || actionKey}`,
        difficulty: finalDifficulty
      });
    } else if (YsystemDiceCls) {
      const skillName = actor.system?.habilidades?.conducir ? "conducir" : "atletismo";
      result = await YsystemDiceCls.rollSkill(actor, skillName, {
        dificultad: finalDifficulty,
        labelName: `Persecución (${p.role === "pursuer" ? "Perseguidor" : "Perseguido"}): ${movConfig?.label || actionKey}`
      });
    } else {
      ui.notifications.info(`Tirada de ${actor.name} con dificultad total: ${finalDifficulty}`);
    }

    if (result) {
      this._handleMovementResult(p, actionKey, result);
    }

    if (p.obstaculizadoMod > 0) {
      p.obstaculizadoMod = 0;
      await ChaseState.update({ participants: state.participants }, { broadcast: false });
    }
  }

  async _handleMovementResult(participant, actionKey, rollResult) {
    if (!rollResult) return;
    const isSuccess = rollResult.isSuccess || rollResult.exito;
    const isCrit = rollResult.isCritical || rollResult.critico;

    if (isSuccess) {
      let delta = 1;
      if (actionKey === "quemar_rueda") delta = isCrit ? 3 : 2;
      else if (actionKey === "cambiar_posicion") delta = isCrit ? 2 : 1;
      else if (actionKey === "obstaculizar") delta = 1;

      await ChaseState.setParticipantFranja(participant.id, delta);
      ui.notifications.info(`ᚱ ${participant.name} (${participant.role === "pursuer" ? "Perseguidor" : "Perseguido"}) supera la tirada y avanza ${delta} franja(s).`);
    } else {
      ui.notifications.warn(`ᚺ ${participant.name} no supera la tirada de movimiento y permanece en la Franja ${participant.franja}.`);
    }
  }

  async _executeManeuverRoll(participantId, maneuverKey) {
    const state = ChaseState.get();
    const p = state.participants.find(x => x.id === participantId);
    if (!p) return;

    const actor = await this._getActor(p.actorUuid);
    if (!actor) return;

    const maneuverConfig = CONFIG.CAMC?.persecucion?.maniobras?.find(m => m.key === maneuverKey);
    const label = maneuverConfig?.label || maneuverKey;

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="camc-chat-card">
          <header>
            <h3><i class="fas fa-crosshairs"></i> Maniobra Rúnica de Persecución</h3>
            <strong>${actor.name} (${p.role === "pursuer" ? "Perseguidor" : "Perseguido"})</strong>
          </header>
          <p><b>${label}:</b> ${maneuverConfig?.summary || "Maniobra táctica en persecución."}</p>
        </div>
      `
    });
  }
}
