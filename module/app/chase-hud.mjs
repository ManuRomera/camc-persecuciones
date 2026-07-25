import { ChaseState } from "../model/chase-state.mjs";

const ApplicationV1 = foundry.appv1?.api?.Application || Application;

/**
 * HUD interactivo Rúnico-Motero para el Control de Persecuciones en Cuervos de Asgard MC.
 * Integración bidireccional total con Hojas de Personaje y Moto del sistema.
 */
export class CAMCChaseHUD extends ApplicationV1 {
  constructor(options = {}) {
    super(options);
    this.showGuide = false;
  }

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
      selected: String(t.dificultad) === String(state.terreno) || t.key === state.terreno
    }));
    const visibilidad = (config.visibilidad || []).map(v => ({
      ...v,
      selected: String(v.mod) === String(state.visibilidad) || v.key === state.visibilidad
    }));

    const movimientosOptions = (config.movimiento || [
      { key: "cambiar_posicion", label: "Cambiar de posición", mod: 0, summary: "Avanza 1 franja; 2 con crítico." },
      { key: "mantener_posicion", label: "Mantener posición", mod: null, summary: "No requiere tirada; conserva la franja." },
      { key: "obstaculizar", label: "Obstaculizar", mod: 2, summary: "Si vas 1 franja por delante, dificulta al perseguidor." },
      { key: "quemar_rueda", label: "Quemar rueda", mod: 4, summary: "Avanza 2 franjas; 3 con crítico." }
    ]).map(m => ({
      ...m,
      modText: m.mod !== null ? (m.mod >= 0 ? `+${m.mod} Dif` : `${m.mod} Dif`) : ""
    }));

    const maniobrasOptions = [
      ...(config.maniobras || [
        { key: "embestir", label: "Embestir", mod: 0, summary: "Tirada enfrentada contra Evasión; causa daño de moto." },
        { key: "arrollar", label: "Arrollar", mod: 0, summary: "Contra objetivo a pie; usa daño de moto." },
        { key: "sacar_carretera", label: "Sacar de la carretera", mod: 3, summary: "Fuerza al rival a perder control o abandonar." },
        { key: "evadirse", label: "Evadirse", mod: 0, summary: "Usa Conducir para ganar espacio o cortar persecución." }
      ]),
      { key: "atacar_directo", label: "Atacar directo", mod: 0, summary: "Ataque con arma; +5 a Evasión rival si eres piloto." },
      { key: "atacar_estabilizando", label: "Atacar estabilizando", mod: 0, summary: "Pre-maniobra de Conducir; elimina el +5 a Evasión." },
      { key: "chocar", label: "Chocar directamente", mod: 0, summary: "Misma franja; daño dual a ambas motos." }
    ];

    const maxFranjas = state.franjasMax || 10;
    const franjasRunicas = [];

    for (let f = 1; f <= maxFranjas; f++) {
      const runeObj = ChaseState.FRANJA_RUNES.find(r => r.num === f) || { rune: "ᚱ", label: "" };
      const pursuersRaw = state.participants.filter(p => p.role === "pursuer" && p.franja === f);
      const evadersRaw = state.participants.filter(p => p.role === "evader" && p.franja === f);

      const pursuers = await Promise.all(pursuersRaw.map(p => this._enrichParticipantForTrack(p)));
      const evaders = await Promise.all(evadersRaw.map(p => this._enrichParticipantForTrack(p)));

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

    // Ordenar por iniciativa descendente
    const sortedParticipants = [...state.participants].sort((a, b) => (Number(b.iniciativa) || 0) - (Number(a.iniciativa) || 0));

    const enrichedParticipants = await Promise.all(sortedParticipants.map(async (p, index) => {
      const { pilotActor, motoActor } = await this._resolvePilotAndMoto(p);

      let mountInfo = null;
      if (motoActor) {
        const estVal = Number(motoActor.system?.reglas?.estructura?.value ?? motoActor.system?.estructura?.value ?? 15);
        const estMax = Number(motoActor.system?.reglas?.estructura?.max ?? motoActor.system?.estructura?.max ?? 15);
        const maniobrabilidad = Number(motoActor.system?.reglas?.maniobrabilidad ?? motoActor.system?.maniobrabilidad ?? 2);
        const danoGrave = Boolean(motoActor.system?.reglas?.dano_grave || (estVal > 0 && estVal <= Math.floor(estMax / 2)));

        mountInfo = {
          actor: motoActor,
          uuid: motoActor.uuid,
          name: motoActor.name,
          img: motoActor.img || "icons/svg/item-bag.svg",
          maniobrabilidad: maniobrabilidad,
          estructuraVal: estVal,
          estructuraMax: estMax,
          estructuraPct: Math.clamp(Math.round((estVal / Math.max(1, estMax)) * 100), 0, 100),
          danoGrave: danoGrave
        };
      }

      let healthInfo = null;
      if (pilotActor) {
        const hVal = Number(pilotActor.system?.combate?.salud?.value ?? pilotActor.system?.salud?.value ?? 10);
        const hMax = Number(pilotActor.system?.combate?.salud?.max ?? pilotActor.system?.salud?.max ?? 10);
        healthInfo = {
          value: hVal,
          max: hMax,
          pct: Math.clamp(Math.round((hVal / Math.max(1, hMax)) * 100), 0, 100)
        };
      }

      const isControlled = isGM || (pilotActor ? pilotActor.isOwner : false);
      const rankNum = index + 1;
      const rankText = rankNum === 1 ? "🥇 1º (Más Rápido)" : (rankNum === 2 ? "🥈 2º" : (rankNum === 3 ? "🥉 3º" : `${rankNum}º`));

      return {
        ...p,
        pilotActor,
        motoActor,
        name: pilotActor?.name || p.name,
        img: pilotActor?.img || p.img,
        mountInfo,
        healthInfo,
        isControlled,
        rankNum,
        rankText
      };
    }));

    const perseguidores = enrichedParticipants.filter(p => p.role === "pursuer");
    const perseguidos = enrichedParticipants.filter(p => p.role === "evader");

    return {
      ...data,
      state,
      isGM,
      showGuide: this.showGuide,
      baseDifficulty,
      terrenos,
      visibilidad,
      movimientosOptions,
      maniobrasOptions,
      franjasRunicas,
      perseguidores,
      perseguidos
    };
  }

  async _enrichParticipantForTrack(p) {
    const { pilotActor, motoActor } = await this._resolvePilotAndMoto(p);
    return {
      ...p,
      pilotName: pilotActor?.name || p.name,
      pilotImg: pilotActor?.img || p.img,
      motoName: motoActor?.name || null,
      motoImg: motoActor?.img || null
    };
  }

  /**
   * Resolución de Piloto y Moto desde las hojas del sistema Cuervos de Asgard MC.
   */
  async _resolvePilotAndMoto(participant) {
    let mainActor = await this._getActor(participant.actorUuid);
    let pilotActor = null;
    let motoActor = null;

    if (mainActor?.type === "moto") {
      motoActor = mainActor;
      const ownerUuid = motoActor.system?.vinculo?.ownerUuid || motoActor.system?.reglas?.piloto_uuid;
      if (ownerUuid) pilotActor = await this._getActor(ownerUuid);
      if (!pilotActor) {
        pilotActor = game.actors?.find(a => a.type === "personaje" && a.system?.mount?.uuid === motoActor.uuid);
      }
      if (!pilotActor) pilotActor = game.user?.character || null;
    } else {
      pilotActor = mainActor;
      const mountUuid = participant.mountUuid || pilotActor?.system?.mount?.uuid;
      if (mountUuid) {
        motoActor = await this._getActor(mountUuid);
      }
      if (!motoActor && pilotActor) {
        motoActor = game.actors?.find(a => 
          a.type === "moto" && (
            a.system?.vinculo?.ownerUuid === pilotActor.uuid ||
            a.system?.vinculo?.ownerUuid === pilotActor.id ||
            a.system?.reglas?.piloto_uuid === pilotActor.uuid ||
            a.system?.reglas?.piloto_uuid === pilotActor.id ||
            a.system?.vinculo?.ownerName === pilotActor.name
          )
        );
      }
    }

    return { pilotActor, motoActor };
  }

  async _getActor(uuidOrId) {
    if (!uuidOrId) return null;
    try {
      if (typeof uuidOrId === "string" && (uuidOrId.startsWith("Actor.") || uuidOrId.startsWith("Compendium.") || uuidOrId.startsWith("Scene."))) {
        const doc = await fromUuid(uuidOrId);
        return doc?.actor || doc;
      }
    } catch (e) {}
    return game.actors?.get(uuidOrId) || game.actors?.find(a => a.uuid === uuidOrId || a.id === uuidOrId) || null;
  }

  async _getSystemRollers() {
    let MountRollsCls = game.camc?.CAMCMountRolls || game.cuervosDeAsgard?.CAMCMountRolls;
    if (!MountRollsCls) {
      try {
        const mod = await import("/systems/cuervos-de-asgard-mc/module/mount/mount-rolls.mjs");
        MountRollsCls = mod.CAMCMountRolls;
      } catch (e) {}
    }

    let YsystemDiceCls = game.camc?.dice || game.cuervosDeAsgard?.dice;
    if (!YsystemDiceCls) {
      try {
        const mod = await import("/systems/cuervos-de-asgard-mc/module/dice/ysystem-dice.mjs");
        YsystemDiceCls = mod.YsystemDice;
      } catch (e) {}
    }

    return { MountRollsCls, YsystemDiceCls };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const container = html[0] || html;
    const isGM = game.user.isGM;

    container.addEventListener("dragover", ev => ev.preventDefault());
    container.addEventListener("drop", ev => this._onDrop(ev));

    container.querySelector(".btn-toggle-guide")?.addEventListener("click", () => {
      this.showGuide = !this.showGuide;
      this.render(false);
    });

    container.querySelector(".btn-close-guide")?.addEventListener("click", () => {
      this.showGuide = false;
      this.render(false);
    });

    container.querySelector(".btn-roll-initiatives")?.addEventListener("click", async () => {
      await this._rollAllInitiatives();
    });

    container.querySelector(".btn-show-all")?.addEventListener("click", async () => {
      await ChaseState.showToAllPlayers();
      ui.notifications.info("📢 Pantalla de persecución enviada a todos los jugadores.");
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

      container.querySelector(".btn-delete-chase")?.addEventListener("click", async () => {
        const confirm = await Dialog.confirm({
          title: "Eliminar Persecución",
          content: "<p>¿Estás seguro de finalizar y eliminar completamente esta persecución?</p>"
        });
        if (confirm) {
          await ChaseState.clearChase();
          this.close();
          ui.notifications.info("🗑️ Persecución eliminada correctamente.");
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

    container.querySelectorAll(".btn-roll-mov-direct").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        const select = container.querySelector(`select.mov-action-select[data-id="${id}"]`);
        const actionKey = select ? select.value : "cambiar_posicion";
        await this._executeMovementRoll(id, actionKey);
      });
    });

    container.querySelectorAll(".btn-roll-man-direct").forEach(btn => {
      btn.addEventListener("click", async ev => {
        const id = ev.currentTarget.dataset.id;
        const select = container.querySelector(`select.man-action-select[data-id="${id}"]`);
        const maneuverKey = select ? select.value : "embestir";
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

  async _rollAllInitiatives() {
    const state = ChaseState.get();
    if (!state.participants.length) {
      ui.notifications.warn("Añade participantes antes de tirar iniciativa.");
      return;
    }

    ui.notifications.info("🎲 Tirando iniciativa de persecución para todos los pilotos...");

    const results = [];
    for (const p of state.participants) {
      const { pilotActor } = await this._resolvePilotAndMoto(p);

      if (pilotActor) {
        const bonus = Number(pilotActor.system?.combate?.iniciativa ?? 0);
        const roll = await new Roll(`1d6 + ${bonus}`).evaluate({ async: true });
        p.iniciativa = roll.total;
        results.push(`<li><b>${pilotActor.name}:</b> ${roll.total} (1D + ${bonus})</li>`);
      }
    }

    state.participants.sort((a, b) => (Number(b.iniciativa) || 0) - (Number(a.iniciativa) || 0));
    await ChaseState.update({ participants: state.participants });

    ChatMessage.create({
      content: `
        <div class="camc-chat-card">
          <header><h3><i class="fas fa-flag-checkered"></i> Iniciativa de Persecución</h3></header>
          <ol>${results.join("")}</ol>
        </div>
      `
    });
  }

  async _executeMovementRoll(participantId, actionKey) {
    const state = ChaseState.get();
    const p = state.participants.find(x => x.id === participantId);
    if (!p) return;

    const { pilotActor, motoActor } = await this._resolvePilotAndMoto(p);
    if (!pilotActor) {
      ui.notifications.error(`No se encontró el piloto para ${p.name}`);
      return;
    }

    const { MountRollsCls, YsystemDiceCls } = await this._getSystemRollers();

    const baseDiff = ChaseState.getBaseDifficulty(state);
    const movConfig = CONFIG.CAMC?.persecucion?.movimiento?.find(m => m.key === actionKey);
    const actionMod = movConfig?.mod ?? 0;
    const actionLabel = movConfig?.label || actionKey;

    if (actionKey === "mantener_posicion") {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: pilotActor }),
        content: `
          <div class="camc-chat-card">
            <header>
              <h3><i class="fas fa-tachometer-alt"></i> Movimiento de Persecución</h3>
              <strong>${pilotActor.name} (${p.role === "pursuer" ? "Perseguidor" : "Perseguido"})</strong>
            </header>
            <p><b>Mantener posición:</b> Conserva la Franja ${p.franja} sin necesidad de realizar tirada.</p>
          </div>
        `
      });
      return;
    }

    const targetDifficulty = baseDiff + actionMod + (p.obstaculizadoMod || 0);

    let result = null;

    if (motoActor && MountRollsCls) {
      result = await MountRollsCls.rollDrive(pilotActor, motoActor, {
        label: `Persecución (${p.role === "pursuer" ? "Perseguidor" : "Perseguido"}): ${actionLabel}`,
        difficulty: targetDifficulty
      });
    } else if (YsystemDiceCls) {
      const skillName = pilotActor.system?.habilidades?.conducir ? "conducir" : "atletismo";
      result = await YsystemDiceCls.rollSkill(pilotActor, skillName, {
        dificultad: targetDifficulty,
        labelName: `Persecución (${p.role === "pursuer" ? "Perseguidor" : "Perseguido"}): ${actionLabel}`
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
      else if (actionKey === "obstaculizar") {
        delta = 1;
        const state = ChaseState.get();
        const rival = state.participants.find(x => x.role !== participant.role && x.franja === participant.franja - 1);
        if (rival) {
          rival.obstaculizadoMod = isCrit ? 6 : 3;
          await ChaseState.update({ participants: state.participants });
          ui.notifications.info(`🛡️ ${participant.name} obstaculiza a ${rival.name} imponiendo +${rival.obstaculizadoMod} a su próxima tirada.`);
        }
      }

      await ChaseState.setParticipantFranja(participant.id, delta);
      ui.notifications.info(`ᚱ ${participant.name} (${participant.role === "pursuer" ? "Perseguidor" : "Perseguido"}) supera la tirada y avanza ${delta} franja(s).`);
    } else {
      ui.notifications.warn(`ᚺ ${participant.name} no supera la tirada y permanece en la Franja ${participant.franja}.`);
    }
  }

  async _executeManeuverRoll(participantId, maneuverKey) {
    const state = ChaseState.get();
    const attacker = state.participants.find(x => x.id === participantId);
    if (!attacker) return;

    const { pilotActor: attackerActor, motoActor: attackerMoto } = await this._resolvePilotAndMoto(attacker);
    if (!attackerActor) {
      ui.notifications.error("No se encontró el piloto atacante.");
      return;
    }

    const opponents = state.participants.filter(p => p.role !== attacker.role);
    if (!opponents.length) {
      ui.notifications.warn("No hay oponentes en la persecución para realizar la maniobra.");
      return;
    }

    const sameFranjaOpponents = opponents.filter(p => p.franja === attacker.franja);
    const requiresSameFranja = ["chocar", "embestir", "arrollar", "sacar_carretera", "abordar"].includes(maneuverKey);

    if (requiresSameFranja && !sameFranjaOpponents.length && maneuverKey !== "evadirse") {
      ui.notifications.warn(`La maniobra '${maneuverKey}' requiere estar en la MISMA FRANJA (Franja ${attacker.franja}) que el objetivo.`);
      return;
    }

    const availableTargets = requiresSameFranja ? sameFranjaOpponents : opponents;
    let targetParticipant = availableTargets[0];

    if (availableTargets.length > 1 && maneuverKey !== "evadirse") {
      targetParticipant = await this._promptTargetSelection(availableTargets, maneuverKey);
      if (!targetParticipant) return;
    }

    const { pilotActor: targetActor, motoActor: targetMoto } = await this._resolvePilotAndMoto(targetParticipant || {});

    if (maneuverKey === "embestir") {
      await this._resolveRam(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, targetMoto, state);
    } else if (maneuverKey === "arrollar") {
      await this._resolveOverrun(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, state);
    } else if (maneuverKey === "sacar_carretera") {
      await this._resolveOffRoad(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, state);
    } else if (maneuverKey === "evadirse") {
      await this._resolveEvade(attacker, attackerActor, attackerMoto, state);
    } else if (maneuverKey === "atacar_directo") {
      await this._resolveDirectAttack(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, state);
    } else if (maneuverKey === "atacar_estabilizando") {
      await this._resolveStabilizedAttack(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, state);
    } else if (maneuverKey === "chocar") {
      await this._resolveCrash(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, targetMoto, state);
    }
  }

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

  async _resolveRam(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, targetMoto, state) {
    const { MountRollsCls, YsystemDiceCls } = await this._getSystemRollers();

    const selfDmgRoll = await new Roll("1d6").evaluate({ async: true });
    await this._applyDamageToTarget(attacker, attackerActor, selfDmgRoll.total);

    const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
    const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? 10);
    const finalDifficulty = targetEvasion + 2 + visibMod;

    let ramResult = null;
    if (attackerMoto && MountRollsCls) {
      ramResult = await MountRollsCls.rollDrive(attackerActor, attackerMoto, {
        label: `Embestir a ${targetActor?.name}`,
        difficulty: finalDifficulty
      });
    } else if (YsystemDiceCls) {
      ramResult = await YsystemDiceCls.rollSkill(attackerActor, "conducir", {
        dificultad: finalDifficulty,
        labelName: `Embestir a ${targetActor?.name}`
      });
    }

    if (ramResult && (ramResult.exito || ramResult.isSuccess)) {
      const ramDmgRoll = await new Roll("2d6 - 1").evaluate({ async: true });
      await this._applyDamageToTarget(targetParticipant, targetActor, Math.max(1, ramDmgRoll.total));
    }
  }

  async _resolveOverrun(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, state) {
    const { MountRollsCls, YsystemDiceCls } = await this._getSystemRollers();
    const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
    const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? 10);
    const finalDifficulty = targetEvasion + visibMod;

    let overrunResult = null;
    if (attackerMoto && MountRollsCls) {
      overrunResult = await MountRollsCls.rollDrive(attackerActor, attackerMoto, {
        label: `Arrollar a objetivo a pie (${targetActor?.name})`,
        difficulty: finalDifficulty
      });
    } else if (YsystemDiceCls) {
      overrunResult = await YsystemDiceCls.rollSkill(attackerActor, "conducir", {
        dificultad: finalDifficulty,
        labelName: `Arrollar a ${targetActor?.name}`
      });
    }

    if (overrunResult && (overrunResult.exito || overrunResult.isSuccess)) {
      const dmgRoll = await new Roll("2d6").evaluate({ async: true });
      await this._applyDamageToTarget(targetParticipant, targetActor, dmgRoll.total);
    }
  }

  async _resolveOffRoad(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, state) {
    const { MountRollsCls, YsystemDiceCls } = await this._getSystemRollers();
    const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
    const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? 10);
    const finalDifficulty = targetEvasion + 3 + visibMod;

    let result = null;
    if (attackerMoto && MountRollsCls) {
      result = await MountRollsCls.rollDrive(attackerActor, attackerMoto, {
        label: `Sacar de la carretera a ${targetActor?.name}`,
        difficulty: finalDifficulty
      });
    } else if (YsystemDiceCls) {
      result = await YsystemDiceCls.rollSkill(attackerActor, "conducir", {
        dificultad: finalDifficulty,
        labelName: `Sacar de la carretera a ${targetActor?.name}`
      });
    }

    if (result && (result.exito || result.isSuccess)) {
      await ChaseState.setParticipantFranja(targetParticipant.id, -2);
      ui.notifications.warn(`💥 ${targetActor?.name} pierde el control y retrocede 2 franjas fuera de la pista.`);
    }
  }

  async _resolveEvade(attacker, attackerActor, attackerMoto, state) {
    const { MountRollsCls, YsystemDiceCls } = await this._getSystemRollers();
    const baseDiff = ChaseState.getBaseDifficulty(state);

    let result = null;
    if (attackerMoto && MountRollsCls) {
      result = await MountRollsCls.rollDrive(attackerActor, attackerMoto, {
        label: "Evadirse de la persecución",
        difficulty: baseDiff
      });
    } else if (YsystemDiceCls) {
      result = await YsystemDiceCls.rollSkill(attackerActor, "conducir", {
        dificultad: baseDiff,
        labelName: "Evadirse de la persecución"
      });
    }

    if (result && (result.exito || result.isSuccess)) {
      await ChaseState.setParticipantFranja(attacker.id, 1);
      ui.notifications.info(`🟢 ${attackerActor.name} gana 1 franja de espacio con la maniobra Evadirse.`);
    }
  }

  async _resolveDirectAttack(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, state) {
    const { MountRollsCls, YsystemDiceCls } = await this._getSystemRollers();

    const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
    const driverMod = attacker.isDriver ? 5 : 2;
    const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? targetActor?.system?.evasion ?? 10);
    const finalDifficulty = targetEvasion + driverMod + visibMod;

    let attackResult = null;
    if (attackerMoto && MountRollsCls) {
      attackResult = await MountRollsCls.rollDrive(attackerActor, attackerMoto, {
        label: `Ataque Directo a ${targetActor?.name || "Objetivo"}`,
        difficulty: finalDifficulty
      });
    } else if (YsystemDiceCls) {
      const skillName = attackerActor.system?.habilidades?.armas_fuego ? "armas_fuego" : "conducir";
      attackResult = await YsystemDiceCls.rollSkill(attackerActor, skillName, {
        dificultad: finalDifficulty,
        labelName: `Ataque Directo a ${targetActor?.name}`
      });
    }

    if (attackResult && (attackResult.exito || attackResult.isSuccess)) {
      const damageRoll = await new Roll("2d6").evaluate({ async: true });
      await this._applyDamageToTarget(targetParticipant, targetActor, damageRoll.total);
    }
  }

  async _resolveStabilizedAttack(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, state) {
    const { MountRollsCls, YsystemDiceCls } = await this._getSystemRollers();

    const baseDiff = ChaseState.getBaseDifficulty(state);
    let stabResult = null;

    if (attackerMoto && MountRollsCls) {
      stabResult = await MountRollsCls.rollDrive(attackerActor, attackerMoto, {
        label: "Pre-maniobra: Estabilizar Vehículo",
        difficulty: baseDiff
      });
    } else if (YsystemDiceCls) {
      stabResult = await YsystemDiceCls.rollSkill(attackerActor, "conducir", {
        dificultad: baseDiff,
        labelName: "Pre-maniobra: Estabilizar Vehículo"
      });
    }

    if (stabResult && (stabResult.exito || stabResult.isSuccess)) {
      const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
      const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? 10);
      const finalDifficulty = targetEvasion + visibMod;

      const attackResult = await YsystemDiceCls.rollSkill(attackerActor, "armas_fuego", {
        dificultad: finalDifficulty,
        labelName: `Ataque Estabilizado a ${targetActor?.name}`
      });

      if (attackResult && (attackResult.exito || attackResult.isSuccess)) {
        const damageRoll = await new Roll("2d6").evaluate({ async: true });
        await this._applyDamageToTarget(targetParticipant, targetActor, damageRoll.total);
      }
    }
  }

  async _resolveCrash(attacker, attackerActor, attackerMoto, targetParticipant, targetActor, targetMoto, state) {
    const { MountRollsCls, YsystemDiceCls } = await this._getSystemRollers();

    const visibMod = CONFIG.CAMC?.persecucion?.visibilidad?.find(v => v.key === state.visibilidad)?.mod || 0;
    const targetEvasion = Number(targetActor?.system?.combate?.evasion ?? 10);
    const finalDifficulty = targetEvasion + 4 + visibMod;

    let crashResult = null;
    if (attackerMoto && MountRollsCls) {
      crashResult = await MountRollsCls.rollDrive(attackerActor, attackerMoto, {
        label: `Chocar directamente contra ${targetActor?.name}`,
        difficulty: finalDifficulty
      });
    } else if (YsystemDiceCls) {
      crashResult = await YsystemDiceCls.rollSkill(attackerActor, "conducir", {
        dificultad: finalDifficulty,
        labelName: `Chocar directamente contra ${targetActor?.name}`
      });
    }

    if (crashResult && (crashResult.exito || crashResult.isSuccess)) {
      const dmgRoll1 = await new Roll("2d6").evaluate({ async: true });
      const dmgRoll2 = await new Roll("2d6").evaluate({ async: true });

      await this._applyDamageToTarget(targetParticipant, targetActor, dmgRoll1.total);
      await this._applyDamageToTarget(attacker, attackerActor, dmgRoll2.total);
    }
  }

  // --- APLICACIÓN EN LAS HOJAS OFICIALES DE FOUNDRY VTT ---
  async _applyDamageToTarget(participant, actor, damage) {
    if (!actor || damage <= 0) return;

    const { pilotActor, motoActor } = await this._resolvePilotAndMoto(participant);

    // 1. Daño en la Hoja de la Moto
    if (motoActor) {
      const currentEst = Number(motoActor.system?.reglas?.estructura?.value ?? motoActor.system?.estructura?.value ?? 15);
      const maxEst = Number(motoActor.system?.reglas?.estructura?.max ?? motoActor.system?.estructura?.max ?? 15);
      const newEst = Math.max(0, currentEst - damage);

      if (motoActor.system?.reglas?.estructura) {
        await motoActor.update({ "system.reglas.estructura.value": newEst });
      } else if (motoActor.system?.estructura) {
        await motoActor.update({ "system.estructura.value": newEst });
      }
      ui.notifications.warn(`⚡ Estructura de ${motoActor.name} reducida a ${newEst}/${maxEst}.`);
    }

    // 2. Daño en la Hoja del Personaje
    if (pilotActor) {
      const currentHealth = Number(pilotActor.system?.combate?.salud?.value ?? pilotActor.system?.salud?.value ?? 10);
      const maxHealth = Number(pilotActor.system?.combate?.salud?.max ?? pilotActor.system?.combate?.salud?.max ?? 10);
      const newHealth = Math.max(0, currentHealth - Math.ceil(damage / 2));

      if (pilotActor.system?.combate?.salud) {
        await pilotActor.update({ "system.combate.salud.value": newHealth });
      } else if (pilotActor.system?.salud) {
        await pilotActor.update({ "system.salud.value": newHealth });
      }
      ui.notifications.warn(`⚡ Salud de ${pilotActor.name} reducida a ${newHealth}/${maxHealth}.`);
    }

    const state = ChaseState.get();
    await ChaseState.update({ participants: state.participants });
  }
}
