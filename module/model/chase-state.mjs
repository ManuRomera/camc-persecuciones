/**
 * Modelo de Estado Global para Persecuciones en Cuervos de Asgard MC.
 * Integración con Motos Vinculadas, Maniobrabilidad y Daño Grave.
 */
export class ChaseState {
  static SETTING_KEY = "activeChaseState";
  static MODULE_ID = "camc-persecuciones";

  static FRANJA_RUNES = [
    { num: 1, rune: "ᚠ", name: "Fehu", label: "Origen" },
    { num: 2, rune: "ᚢ", name: "Uruz", label: "Fuerza" },
    { num: 3, rune: "ᚦ", name: "Thurisaz", label: "Desafío" },
    { num: 4, rune: "ᚨ", name: "Ansuz", label: "Aliento" },
    { num: 5, rune: "ᚱ", name: "Raidho", label: "La Carrera" },
    { num: 6, rune: "ᚲ", name: "Kenaz", label: "Fuego" },
    { num: 7, rune: "ᚷ", name: "Gebo", label: "Pacto" },
    { num: 8, rune: "ᚹ", name: "Wunjo", label: "Victoria" },
    { num: 9, rune: "ᚺ", name: "Hagalaz", label: "Tormenta" },
    { num: 10, rune: "ᛖ", name: "Ehwaz", label: "Valhalla / Huida" }
  ];

  static get() {
    const raw = game.settings.get(this.MODULE_ID, this.SETTING_KEY);
    return this.normalize(raw);
  }

  static normalize(data) {
    const defaultState = {
      active: false,
      title: "ᚱ PERSECUCIÓN EN LAS LLANURAS YERMAS ᛏ",
      terreno: "media",       // facil(8), media(10), desafiante(13), dificil(16), muy_dificil(20)
      visibilidad: "normal",   // normal(+0), mala(+2), pesima(+4)
      franjasMax: 10,
      turno: 1,
      fase: "iniciativa",
      activeParticipantId: null,
      participants: []
    };

    if (!data || typeof data !== "object") return defaultState;

    const merged = foundry.utils.mergeObject(defaultState, data, { inplace: false });
    merged.participants = Array.isArray(merged.participants) ? merged.participants : [];
    return merged;
  }

  static async update(changes, { broadcast = true, showToAll = false } = {}) {
    if (!game.user.isGM) {
      game.socket.emit(`module.${this.MODULE_ID}`, {
        type: "UPDATE_CHASE_STATE",
        changes,
        showToAll
      });
      return;
    }

    const current = this.get();
    const updated = foundry.utils.mergeObject(current, changes, { inplace: false });
    await game.settings.set(this.MODULE_ID, this.SETTING_KEY, updated);

    if (broadcast) {
      game.socket.emit(`module.${this.MODULE_ID}`, {
        type: showToAll ? "OPEN_CHASE_HUD_ALL" : "REFRESH_CHASE_HUD",
        state: updated
      });
      Hooks.callAll("camcChaseStateChanged", updated);
    }

    return updated;
  }

  static async showToAllPlayers() {
    await this.update({ active: true }, { broadcast: true, showToAll: true });
  }

  static async addParticipant({ actor, role = "evader", franja = 1, isDriver = true }) {
    if (!actor) return;
    const current = this.get();

    if (current.participants.some(p => p.actorUuid === actor.uuid || p.actorUuid === actor.id)) {
      ui.notifications.info(`${actor.name} ya está en la persecución.`);
      return;
    }

    let mountUuid = null;
    let mountName = null;
    let mountImg = null;

    if (actor.type === "personaje" || actor.type === "pnj") {
      const uuid = actor.system?.mount?.uuid || actor.system?.vehiculo?.uuid;
      if (uuid) {
        mountUuid = uuid;
        mountName = actor.system.mount?.name || actor.system.vehiculo?.nombre || "Moto Vinculada";
        mountImg = actor.system.mount?.img || "icons/svg/item-bag.svg";
      }
    } else if (actor.type === "moto") {
      mountUuid = actor.uuid;
      mountName = actor.name;
      mountImg = actor.img;
    }

    const newParticipant = {
      id: foundry.utils.randomID(),
      actorUuid: actor.uuid || actor.id,
      name: actor.name,
      img: actor.img || "icons/svg/mystery-man.svg",
      type: actor.type,
      role: role,
      franja: Math.clamp(Number(franja) || 1, 1, current.franjasMax),
      isDriver: Boolean(isDriver),
      mountUuid: mountUuid,
      mountName: mountName,
      mountImg: mountImg,
      status: [],
      iniciativa: 0,
      obstaculizadoMod: 0
    };

    current.participants.push(newParticipant);
    await this.update({ active: true, participants: current.participants }, { broadcast: true, showToAll: true });
    ui.notifications.success(`ᚱ ${actor.name} se une a la persecución en la Franja ${newParticipant.franja}.`);
  }

  static async removeParticipant(participantId) {
    const current = this.get();
    const filtered = current.participants.filter(p => p.id !== participantId);
    await this.update({ participants: filtered });
  }

  static async setParticipantFranja(participantId, deltaOrValue, { absolute = false } = {}) {
    const current = this.get();
    const p = current.participants.find(x => x.id === participantId);
    if (!p) return;

    if (absolute) {
      p.franja = Math.clamp(Number(deltaOrValue), 1, current.franjasMax);
    } else {
      p.franja = Math.clamp(p.franja + Number(deltaOrValue), 1, current.franjasMax);
    }

    await this.update({ participants: current.participants });
  }

  static getBaseDifficulty(state = null) {
    const s = state || this.get();
    const config = CONFIG.CAMC?.persecucion;

    const terrainItem = config?.terrenos?.find(t => t.key === s.terreno);
    const visibItem = config?.visibilidad?.find(v => v.key === s.visibilidad);

    const terrainDiff = terrainItem ? terrainItem.dificultad : 10;
    const visibMod = visibItem ? visibItem.mod : 0;

    return terrainDiff + visibMod;
  }
}
