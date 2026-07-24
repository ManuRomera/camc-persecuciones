/**
 * Modelo de Estado Global para Persecuciones en Cuervos de Asgard MC.
 */
export class ChaseState {
  static SETTING_KEY = "activeChaseState";
  static MODULE_ID = "camc-persecuciones";

  /**
   * Obtiene el estado actual guardado.
   * @returns {Object} Estado de la persecución
   */
  static get() {
    const raw = game.settings.get(this.MODULE_ID, this.SETTING_KEY);
    return this.normalize(raw);
  }

  /**
   * Normaliza y asegura la estructura de datos.
   */
  static normalize(data) {
    const defaultState = {
      active: false,
      title: "Persecución en las Llanuras Yermas",
      terreno: "media",       // facil(8), media(10), desafiante(13), dificil(16), muy_dificil(20)
      visibilidad: "normal",   // normal(+0), mala(+2), pesima(+4)
      franjasMax: 10,
      turno: 1,
      fase: "movimiento",      // movimiento, maniobras, finalizado
      activeParticipantId: null,
      participants: []
    };

    if (!data || typeof data !== "object") return defaultState;

    const merged = foundry.utils.mergeObject(defaultState, data, { inplace: false });
    merged.participants = Array.isArray(merged.participants) ? merged.participants : [];
    return merged;
  }

  /**
   * Guarda y sincroniza el estado en todo el mundo.
   */
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

  /**
   * Muestra el panel de persecución a todos los jugadores conectados.
   */
  static async showToAllPlayers() {
    await this.update({ active: true }, { broadcast: true, showToAll: true });
  }

  /**
   * Añade un personaje o vehículo a la persecución.
   */
  static async addParticipant({ actor, role = "evader", franja = 1, isDriver = true }) {
    if (!actor) return;
    const current = this.get();

    if (current.participants.some(p => p.actorUuid === actor.uuid)) {
      ui.notifications.info(`${actor.name} ya está en la persecución.`);
      return;
    }

    let mountData = null;
    if (actor.type === "personaje" && actor.system?.mount?.uuid) {
      const mountActor = await fromUuid(actor.system.mount.uuid);
      if (mountActor) {
        mountData = {
          uuid: mountActor.uuid,
          name: mountActor.name,
          img: mountActor.img,
          estructura: {
            value: Number(mountActor.system?.estructura?.value ?? 10),
            max: Number(mountActor.system?.estructura?.max ?? 10)
          },
          maniobrabilidad: Number(mountActor.system?.maniobrabilidad ?? 0)
        };
      }
    } else if (actor.type === "moto") {
      mountData = {
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        estructura: {
          value: Number(actor.system?.estructura?.value ?? 10),
          max: Number(actor.system?.estructura?.max ?? 10)
        },
        maniobrabilidad: Number(actor.system?.maniobrabilidad ?? 0)
      };
    }

    const newParticipant = {
      id: foundry.utils.randomID(),
      actorUuid: actor.uuid,
      name: actor.name,
      img: actor.img || "icons/svg/mystery-man.svg",
      type: actor.type,
      role: role,
      franja: Math.clamp(Number(franja) || 1, 1, current.franjasMax),
      isDriver: Boolean(isDriver),
      mount: mountData,
      status: [],
      iniciativa: null,
      obstaculizadoMod: 0
    };

    current.participants.push(newParticipant);
    await this.update({ active: true, participants: current.participants }, { broadcast: true, showToAll: true });
    ui.notifications.success(`${actor.name} añadido a la persecución en la Franja ${newParticipant.franja}.`);
  }

  /**
   * Elimina un participante.
   */
  static async removeParticipant(participantId) {
    const current = this.get();
    const filtered = current.participants.filter(p => p.id !== participantId);
    await this.update({ participants: filtered });
  }

  /**
   * Cambia la franja de un participante.
   */
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

  /**
   * Calcula la Dificultad Base actual del Terreno + Visibilidad.
   */
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
