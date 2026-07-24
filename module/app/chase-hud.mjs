import { ChaseState } from "../model/chase-state.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * HUD interactivo para el Control Visual de Persecuciones en Cuervos de Asgard MC.
 */
export class CAMCChaseHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "camc-chase-hud",
    classes: ["camc", "camc-chase-window"],
    tag: "div",
    window: {
      title: "Control Visual de Persecuciones · Llanuras Yermas",
      icon: "fas fa-flag-checkered",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 1020,
      height: 720,
      top: 80,
      left: 140
    }
  };

  static PARTS = {
    main: {
      template: "modules/camc-persecuciones/templates/chase-hud.hbs"
    }
  };

  /**
   * Prepara los datos para la plantilla Handlebars.
   */
  async _prepareContext(_options) {
    const state = ChaseState.get();
    const isGM = game.user.isGM;
    const baseDifficulty = ChaseState.getBaseDifficulty(state);

    // Obtener listas de opciones del sistema CAMC
    const config = CONFIG.CAMC?.persecucion || {};
    const terrenos = (config.terrenos || []).map(t => ({
      ...t,
      selected: t.key === state.terreno
    }));
    const visibilidad = (config.visibilidad || []).map(v => ({
      ...v,
      selected: v.key === state.visibilidad
    }));

    // Generar franjas (1 a 10) con sus participantes asignados
    const franjas = [];
    const maxFranjas = state.franjasMax || 10;

    for (let f = 1; f <= maxFranjas; f++) {
      const pursuers = state.participants.filter(p => p.role === "pursuer" && p.franja === f);
      const evaders = state.participants.filter(p => p.role === "evader" && p.franja === f);

      franjas.push({
        numero: f,
        isEscape: f === maxFranjas,
        isStart: f === 1,
        pursuers,
        evaders
      });
    }

    // Participantes enriquecidos con datos en tiempo real (Salud, Estructura de moto)
    const enrichedParticipants = await Promise.all(state.participants.map(async p => {
      const actor = await fromUuid(p.actorUuid);
      let health = null;
      let driveSkill = 0;
      let agilidad = 0;

      if (actor) {
        agilidad = Number(actor.system?.atributos?.des ?? actor.system?.atributos?.agilidad ?? 0);
        if (actor.type === "personaje" || actor.type === "pnj") {
          health = {
            value: Number(actor.system?.combate?.salud?.value ?? actor.system?.salud?.value ?? 10),
            max: Number(actor.system?.combate?.salud?.max ?? actor.system?.salud?.max ?? 10)
          };
          driveSkill = Number(actor.system?.habilidades?.conducir?.valor ?? 0);
        }
      }

      return {
        ...p,
        actor,
        health,
        driveSkill,
        agilidad,
        isControlled: actor ? actor.isOwner : isGM
      };
    }));

    // Separar por roles
    const perseguidores = enrichedParticipants.filter(p => p.role === "pursuer");
    const perseguidos = enrichedParticipants.filter(p => p.role === "evader");

    return {
      state,
      isGM,
      baseDifficulty,
      terrenos,
      visibilidad,
      franjas,
      perseguidores,
      perseguidos,
      movimientos: config.movimiento || [],
      maniobras: config.maniobras || []
    };
  }

  /**
   * Configura listeners de eventos tras renderizar el HTML.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Drag & Drop para soltar actores/tokens en el HUD
    html.addEventListener("dragover", ev => ev.preventDefault());
    html.addEventListener("drop", ev => this._onDrop(ev));

    // Listeners del Game Master
    if (context.isGM) {
      // Cambio de terreno
      html.querySelectorAll(".change-terreno").forEach(select => {
        select.addEventListener("change", async ev => {
          await ChaseState.update({ terreno: ev.target.value });
        });
      });

      // Cambio de visibilidad
      html.querySelectorAll(".change-visibilidad").forEach(select => {
        select.addEventListener("change", async ev => {
          await ChaseState.update({ visibilidad: ev.target.value });
        });
      });

      // Control de Turnos y Fases
      html.querySelector(".btn-next-turn")?.addEventListener("click", async () => {
        const state = ChaseState.get();
        await ChaseState.update({ turno: state.turno + 1 });
        ui.notifications.info(`Persecución: Inicio del Turno ${state.turno + 1}`);
      });

      html.querySelector(".btn-reset-chase")?.addEventListener("click", async () => {
        const confirm = await Dialog.confirm({
          title: "Reiniciar Persecución",
          content: "<p>¿Estás seguro de reiniciar las franjas y turnos de la persecución?</p>"
        });
        if (confirm) {
          await ChaseState.update({ turno: 1, fase: "iniciativa" });
        }
      });

      // Cambiar franja directamente por clic en la pista
      html.querySelectorAll(".franja-cell").forEach(cell => {
        cell.addEventListener("click", async ev => {
          const targetFranja = Number(cell.dataset.franja);
          const selectedToken = canvas.tokens?.controlled[0];
          if (selectedToken?.actor) {
            const state = ChaseState.get();
            const part = state.participants.find(p => p.actorUuid === selectedToken.actor.uuid);
            if (part) {
              await ChaseState.setParticipantFranja(part.id, targetFranja, { absolute: true });
            }
          }
        });
      });
    }

    // Botones de control de participantes (+1 / -1 Franja, Eliminar, Cambiar Rol)
    html.querySelectorAll(".btn-move-franja").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        const delta = Number(ev.currentTarget.dataset.delta);
        await ChaseState.setParticipantFranja(id, delta);
      });
    });

    html.querySelectorAll(".btn-remove-participant").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        await ChaseState.removeParticipant(id);
      });
    });

    html.querySelectorAll(".btn-toggle-role").forEach(btn => {
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

    // Lanzador de Tiradas de Movimiento
    html.querySelectorAll(".btn-roll-movement").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const actionKey = ev.currentTarget.dataset.action;
        const participantId = ev.currentTarget.dataset.participantId;
        await this._executeMovementRoll(participantId, actionKey);
      });
    });

    // Lanzador de Tiradas de Maniobra
    html.querySelectorAll(".btn-roll-maneuver").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const maneuverKey = ev.currentTarget.dataset.maneuver;
        const participantId = ev.currentTarget.dataset.participantId;
        await this._executeManeuverRoll(participantId, maneuverKey);
      });
    });
  }

  /**
   * Manejo de Drag & Drop de actores/tokens al panel.
   */
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
      actor = await fromUuid(data.uuid);
    } else if (data.type === "Token") {
      const token = await fromUuid(data.uuid);
      actor = token?.actor;
    }

    if (actor) {
      const role = event.shiftKey ? "pursuer" : "evader";
      await ChaseState.addParticipant({ actor, role, franja: role === "pursuer" ? 1 : 2 });
    }
  }

  /**
   * Ejecuta una tirada de Movimiento integrada con el sistema Cuervos de Asgard.
   */
  async _executeMovementRoll(participantId, actionKey) {
    const state = ChaseState.get();
    const p = state.participants.find(x => x.id === participantId);
    if (!p) return;

    const actor = await fromUuid(p.actorUuid);
    if (!actor) {
      ui.notifications.error("No se encontró el actor asociado.");
      return;
    }

    const baseDiff = ChaseState.getBaseDifficulty(state);
    const movConfig = CONFIG.CAMC?.persecucion?.movimiento?.find(m => m.key === actionKey);
    const actionMod = movConfig?.mod ?? 0;

    // Caso especial: Mantener posición
    if (actionKey === "mantener_posicion") {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `
          <div class="camc-chat-card">
            <header>
              <h3><i class="fas fa-tachometer-alt"></i> Movimiento de Persecución</h3>
              <strong>${actor.name}</strong>
            </header>
            <p><b>Mantener posición:</b> Conserva la Franja ${p.franja} sin realizar tirada.</p>
          </div>
        `
      });
      return;
    }

    const finalDifficulty = baseDiff + actionMod + (p.obstaculizadoMod || 0);

    // Tirada de conducción de moto si tiene montura o tirada normal
    let mountActor = null;
    if (p.mount?.uuid) {
      mountActor = await fromUuid(p.mount.uuid);
    }

    // Invocación a tiradas del sistema CAMC
    if (mountActor && game.cuervosDeAsgard?.CAMCMountRolls) {
      const result = await game.cuervosDeAsgard.CAMCMountRolls.rollDrive(actor, mountActor, {
        label: `Persecución: ${movConfig?.label || actionKey}`,
        difficulty: finalDifficulty
      });
      this._handleMovementResult(p, actionKey, result);
    } else {
      // Tirada básica de Conducir / Atletismo vía YsystemDice
      const skillName = actor.system?.habilidades?.conducir ? "conducir" : "atletismo";
      if (game.cuervosDeAsgard?.YsystemDice) {
        const result = await game.cuervosDeAsgard.YsystemDice.rollSkill(actor, skillName, {
          dificultad: finalDifficulty,
          labelName: `Persecución: ${movConfig?.label || actionKey}`
        });
        this._handleMovementResult(p, actionKey, result);
      } else {
        ui.notifications.warn("Tirada realizada con modificador total de dificultad: " + finalDifficulty);
      }
    }

    // Limpiar modificador de obstaculizado tras la tirada de movimiento
    if (p.obstaculizadoMod > 0) {
      p.obstaculizadoMod = 0;
      await ChaseState.update({ participants: state.participants }, { broadcast: false });
    }
  }

  /**
   * Procesa el resultado de movimiento para avanzar franjas de forma inteligente.
   */
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
      ui.notifications.info(`${participant.name} avanza ${delta} franja(s) en la persecución.`);
    }
  }

  /**
   * Ejecuta una tirada de Maniobra de Persecución.
   */
  async _executeManeuverRoll(participantId, maneuverKey) {
    const state = ChaseState.get();
    const p = state.participants.find(x => x.id === participantId);
    if (!p) return;

    const actor = await fromUuid(p.actorUuid);
    if (!actor) return;

    const maneuverConfig = CONFIG.CAMC?.persecucion?.maniobras?.find(m => m.key === maneuverKey);
    const label = maneuverConfig?.label || maneuverKey;

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="camc-chat-card">
          <header>
            <h3><i class="fas fa-crosshairs"></i> Maniobra de Persecución</h3>
            <strong>${actor.name}</strong>
          </header>
          <p><b>${label}:</b> ${maneuverConfig?.summary || "Maniobra táctica en persecución."}</p>
        </div>
      `
    });
  }
}
