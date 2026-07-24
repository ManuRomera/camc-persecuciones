import { ChaseState } from "../model/chase-state.mjs";

const ApplicationV1 = foundry.appv1?.api?.Application || Application;

/**
 * HUD interactivo Rúnico-Motero para el Control de Persecuciones en Cuervos de Asgard MC.
 * Incluye automatización completa de Maniobras, Daños de Estructura y Ataques Tácticos.
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

  async _getActor(uuidOrId) {
    if (!uuidOrId) return null;
    try {
      if (uuidOrId.startsWith("Actor.") || uuidOrId.startsWith("Compendium.") || uuidOrId.startsWith("Scene.")) {
        const doc = await fromUuid(uuidOrId);
        return doc?.actor || doc;
      }
    } catch (e) {}
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

    // BOTONES DIRECTOS DE MOVIMIENTO
    container.querySelectorAll(".btn-roll-mov-direct").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        const select = container.querySelector(`select.mov-action-select[data-id="${id}"]`);
        const actionKey = select ? select.value : "cambiar_posicion";
        await this._executeMovementRoll(id, actionKey);
      });
    });

    // BOTONES DIRECTOS DE MANIOBRA
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

  // --- LOGICA DE MOVIMIENTO ---
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

    let YsystemDiceCls = game.camc?.dice || game.cuervosDeAsgard?.dice;
    if (!YsystemDiceCls) {
      try {
        const mod = await import("/systems/cuervos-de-asgard-mc/module/dice/ysystem-dice.mjs");
        YsystemDiceCls = mod.YsystemDice;
      } catch (e) {}
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
      ui.notifications.warn(`ᚺ ${participant.name} no supera la tirada y permanece en la Franja ${participant.franja}.`);
    }
  }

  // --- AUTOMATIZACIÓN DE MANIOBRAS Y ATAQUES ---
  async _executeManeuverRoll(participantId, maneuverKey) {
    const state = ChaseState.get();
    const attacker = state.participants.find(x => x.id === participantId);
    if (!attacker) return;

    const attackerActor = await this._getActor(attacker.actorUuid);
    if (!attackerActor) {
      ui.notifications.error("No se encontró el actor atacante.");
      return;
    }

    const opponents = state.participants.filter(p => p.role !== attacker.role);
    if (!opponents.length) {
      ui.notifications.warn("No hay oponentes en la persecución para realizar la maniobra.");
      return;
    }

    const sameFranjaOpponents = opponents.filter(p => p.franja === attacker.franja);
    const requiresSameFranja = ["chocar", "embestir", "abordar", "atrapar"].includes(maneuverKey);

    if (requiresSameFranja && !sameFranjaOpponents.length) {
      ui.notifications.warn(`La maniobra '${maneuverKey}' requiere estar en la MISMA FRANJA (Franja ${attacker.franja}) que el objetivo.`);
      return;
    }

    const availableTargets = requiresSameFranja ? sameFranjaOpponents : opponents;
    let targetParticipant = availableTargets[0];

    if (availableTargets.length > 1) {
      targetParticipant = await this._promptTargetSelection(availableTargets, maneuverKey);
      if (!targetParticipant) return;
    }

    const targetActor = await this._getActor(targetParticipant.actorUuid);

    if (maneuverKey === "atacar_directo") {
      await this._resolveDirectAttack(attacker, attackerActor, targetParticipant, targetActor, state);
    } else if (maneuverKey === "atacar_estabilizando") {
      await this._resolveStabilizedAttack(attacker, attackerActor, targetParticipant, targetActor, state);
    } else if (maneuverKey === "chocar") {
      await this._resolveCrash(attacker, attackerActor, targetParticipant, targetActor, state);
    } else if (maneuverKey === "embestir") {
      await this._resolveRam(attacker, attackerActor, targetParticipant, targetActor, state);
    } else {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: attackerActor }),
        content: `
          <div class="camc-chat-card">
            <header><h3><i class="fas fa-crosshairs"></i> Maniobra en Franja ${attacker.franja}</h3><strong>${attackerActor.name} ➔ ${targetActor?.name || "Objetivo"}</strong></header>
            <p>Ejecutando maniobra táctica ${maneuverKey}.</p>
          </div>
        `
      });
    }
  }

  /**
   * Diálogo para seleccionar objetivo de maniobra.
   */
  async _promptTargetSelection(targets, maneuverKey) {
    const optionsHtml = targets.map(t => `<option value="${t.id}">${t.name} (Franja ${t.franja})</option>`).join("");
    return new Promise(resolve => {
      new Dialog({
        title: "Seleccionar Objetivo de Maniobra",
        content: `
          <form class="camc-dialog">
            <p>Selecciona el objetivo para la maniobra <b>${maneuverKey}</b>:</p>
            <div class="form-group">
              <select id="target-select">${optionsHtml}</select>
            </div>
          </form>
        `,
        buttons: {
          confirm: {
            icon: '<i class="fas fa-crosshairs"></i>',
            label: "Atacar / Ejecutar",
            callback: html => {
              const id = html.find("#target-select").val();
              resolve(targets.find(t => t.id === id));
            }
          },
          cancel: { label: "Cancelar", callback: () => resolve(null) }
        },
        default: "confirm"
      }).render(true);
    });
  }

  /**
   * Automatización de Ataque Directo.
   */
  async _resolveDirectAttack(attacker, attackerActor, targetParticipant, targetActor, state) {
    let YsystemDiceCls = game.camc?.dice || game.cuervosDeAsgard?.dice;
    if (!YsystemDiceCls) {
      try {
        const mod = await import("/systems/cuervos-de-asgard-mc/module/dice/ysystem-dice.mjs");
        YsystemDiceCls = mod.YsystemDice;
      } catch (e) {}
    }

    const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
    const driverMod = attacker.isDriver ? 5 : 2; // +5 si es piloto, +2 si es pasajero
    const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? targetActor?.system?.evasion ?? 10);
    const finalDifficulty = targetEvasion + driverMod + visibMod;

    const skillName = attackerActor.system?.habilidades?.armas_fuego ? "armas_fuego" : (attackerActor.system?.habilidades?.combate_cuerpo_a_cuerpo ? "combate_cuerpo_a_cuerpo" : "conducir");

    const attackResult = await YsystemDiceCls.rollSkill(attackerActor, skillName, {
      dificultad: finalDifficulty,
      labelName: `Ataque Directo a ${targetActor?.name || "Objetivo"} (Evasión D${finalDifficulty})`
    });

    if (attackResult && (attackResult.exito || attackResult.isSuccess)) {
      // Automatizar o proponer daño
      const damageRoll = await new Roll("2d6").evaluate({ async: true });
      const damage = damageRoll.total;

      await this._applyDamageToTarget(targetParticipant, targetActor, damage);

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: attackerActor }),
        content: `
          <div class="camc-chat-card">
            <header><h3><i class="fas fa-skull-crossbones"></i> ¡IMPACTO DIRECTO!</h3><strong>${attackerActor.name} ➔ ${targetActor?.name}</strong></header>
            <p>El ataque supera la Evasión (${finalDifficulty}). Se infligen <b>${damage} puntos de daño</b> a ${targetActor?.name}.</p>
          </div>
        `,
        rolls: [damageRoll]
      });
    } else {
      ui.notifications.info(`${attackerActor.name} falló el ataque directo contra ${targetActor?.name} (Dificultad Evasión ${finalDifficulty}).`);
    }
  }

  /**
   * Automatización de Ataque Estabilizando (Pre-maniobra de conducción sin penalizador).
   */
  async _resolveStabilizedAttack(attacker, attackerActor, targetParticipant, targetActor, state) {
    let YsystemDiceCls = game.camc?.dice || game.cuervosDeAsgard?.dice;
    if (!YsystemDiceCls) {
      try {
        const mod = await import("/systems/cuervos-de-asgard-mc/module/dice/ysystem-dice.mjs");
        YsystemDiceCls = mod.YsystemDice;
      } catch (e) {}
    }

    const baseDiff = ChaseState.getBaseDifficulty(state);
    ui.notifications.info("Ejecutando pre-maniobra de estabilización de vehículo...");

    const stabResult = await YsystemDiceCls.rollSkill(attackerActor, "conducir", {
      dificultad: baseDiff,
      labelName: "Pre-maniobra: Estabilizar Vehículo"
    });

    if (stabResult && (stabResult.exito || stabResult.isSuccess)) {
      ui.notifications.success("¡Vehículo estabilizado! Ejecutando ataque sin penalización de piloto...");
      const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
      const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? 10);
      const finalDifficulty = targetEvasion + visibMod; // Sin +5 de piloto

      const attackResult = await YsystemDiceCls.rollSkill(attackerActor, "armas_fuego", {
        dificultad: finalDifficulty,
        labelName: `Ataque Estabilizado a ${targetActor?.name}`
      });

      if (attackResult && (attackResult.exito || attackResult.isSuccess)) {
        const damageRoll = await new Roll("2d6").evaluate({ async: true });
        const damage = damageRoll.total;
        await this._applyDamageToTarget(targetParticipant, targetActor, damage);
      }
    } else {
      ui.notifications.warn("La estabilización falló y no se pudo realizar el ataque.");
    }
  }

  /**
   * Automatización de Chocar Directamente (Daño dual a ambos vehículos).
   */
  async _resolveCrash(attacker, attackerActor, targetParticipant, targetActor, state) {
    let YsystemDiceCls = game.camc?.dice || game.cuervosDeAsgard?.dice;
    if (!YsystemDiceCls) {
      try {
        const mod = await import("/systems/cuervos-de-asgard-mc/module/dice/ysystem-dice.mjs");
        YsystemDiceCls = mod.YsystemDice;
      } catch (e) {}
    }

    const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
    const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? 10);
    const finalDifficulty = targetEvasion + 4 + visibMod; // Evasión + 4

    const crashResult = await YsystemDiceCls.rollSkill(attackerActor, "conducir", {
      dificultad: finalDifficulty,
      labelName: `Chocar directamente contra ${targetActor?.name}`
    });

    if (crashResult && (crashResult.exito || crashResult.isSuccess)) {
      const dmgRoll1 = await new Roll("2d6").evaluate({ async: true });
      const dmgRoll2 = await new Roll("2d6").evaluate({ async: true });

      await this._applyDamageToTarget(targetParticipant, targetActor, dmgRoll1.total);
      await this._applyDamageToTarget(attacker, attackerActor, dmgRoll2.total);

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: attackerActor }),
        content: `
          <div class="camc-chat-card">
            <header><h3><i class="fas fa-car-crash"></i> ¡COLISIÓN FRONTAL DE VEHÍCULOS!</h3></header>
            <p><b>${attackerActor.name}</b> choca contra <b>${targetActor?.name}</b> en la Franja ${attacker.franja}.</p>
            <p>➔ Daño causado a ${targetActor?.name}: <b>${dmgRoll1.total} puntos de Estructura</b>.</p>
            <p>➔ Daño sufrido por ${attackerActor.name}: <b>${dmgRoll2.total} puntos de Estructura</b>.</p>
          </div>
        `,
        rolls: [dmgRoll1, dmgRoll2]
      });
    }
  }

  /**
   * Automatización de Embestir.
   */
  async _resolveRam(attacker, attackerActor, targetParticipant, targetActor, state) {
    let YsystemDiceCls = game.camc?.dice || game.cuervosDeAsgard?.dice;
    if (!YsystemDiceCls) {
      try {
        const mod = await import("/systems/cuervos-de-asgard-mc/module/dice/ysystem-dice.mjs");
        YsystemDiceCls = mod.YsystemDice;
      } catch (e) {}
    }

    // Sacrificar 1D de Estructura propia
    const selfDmgRoll = await new Roll("1d6").evaluate({ async: true });
    await this._applyDamageToTarget(attacker, attackerActor, selfDmgRoll.total);
    ui.notifications.info(`${attackerActor.name} sacrifica ${selfDmgRoll.total} puntos de Estructura propia para embestir.`);

    const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
    const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? 10);
    const finalDifficulty = targetEvasion + 2 + visibMod; // Evasión + 2

    const ramResult = await YsystemDiceCls.rollSkill(attackerActor, "conducir", {
      dificultad: finalDifficulty,
      labelName: `Embestir a ${targetActor?.name}`
    });

    if (ramResult && (ramResult.exito || ramResult.isSuccess)) {
      const ramDmgRoll = await new Roll("2d6 - 1").evaluate({ async: true });
      const finalDmg = Math.max(1, ramDmgRoll.total);

      await this._applyDamageToTarget(targetParticipant, targetActor, finalDmg);

      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: attackerActor }),
        content: `
          <div class="camc-chat-card">
            <header><h3><i class="fas fa-truck-monster"></i> ¡EMBESTIDA CON ÉXITO!</h3></header>
            <p><b>${attackerActor.name}</b> embiste a <b>${targetActor?.name}</b> en la Franja ${attacker.franja}.</p>
            <p>Se infligen <b>${finalDmg} puntos de daño a la Estructura</b> de ${targetActor?.name}.</p>
          </div>
        `,
        rolls: [ramDmgRoll]
      });
    }
  }

  /**
   * Aplica daño directamente a la Estructura de la Moto o Salud del Personaje en Foundry VTT.
   */
  async _applyDamageToTarget(participant, actor, damage) {
    if (!actor || damage <= 0) return;

    let mountActor = null;
    if (participant.mount?.uuid) {
      mountActor = await this._getActor(participant.mount.uuid);
    }

    if (mountActor) {
      const current = Number(mountActor.system?.reglas?.estructura?.value ?? 10);
      const newVal = Math.max(0, current - damage);
      await mountActor.update({ "system.reglas.estructura.value": newVal });
      ui.notifications.warn(`Estructura de ${mountActor.name} reducida a ${newVal}/${mountActor.system?.reglas?.estructura?.max ?? 10}.`);
    } else if (actor.type === "moto") {
      const current = Number(actor.system?.reglas?.estructura?.value ?? 10);
      const newVal = Math.max(0, current - damage);
      await actor.update({ "system.reglas.estructura.value": newVal });
      ui.notifications.warn(`Estructura de ${actor.name} reducida a ${newVal}/${actor.system?.reglas?.estructura?.max ?? 10}.`);
    } else {
      const current = Number(actor.system?.combate?.salud?.value ?? actor.system?.salud?.value ?? 10);
      const max = Number(actor.system?.combate?.salud?.max ?? actor.system?.salud?.max ?? 10);
      const newVal = Math.max(0, current - damage);

      if (actor.system?.combate?.salud) {
        await actor.update({ "system.combate.salud.value": newVal });
      } else if (actor.system?.salud) {
        await actor.update({ "system.salud.value": newVal });
      }
      ui.notifications.warn(`Salud de ${actor.name} reducida a ${newVal}/${max}.`);
    }

    // Refrescar HUD
    const state = ChaseState.get();
    await ChaseState.update({ participants: state.participants });
  }
}
