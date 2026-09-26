// Safety policy. Every command, from any source, passes through here before
// it reaches hardware. The AI never talks to devices directly.
//
// Three questions, in order:
//   1. Is it physically safe? (hard limits and interlocks; nobody can override)
//   2. How risky is it?       (low / medium / high)
//   3. Does this origin have the authority for that risk?
//
// Origins:
//   owner       an authenticated homeowner tapped a button, ran a Shortcut,
//               or pressed the car button. Full authority.
//   agent       the AI acting on something the owner just asked for in chat.
//               High-risk actions wait for the owner to confirm.
//   automation  a deterministic rule (motion lights, leak shutoff...).
//   proactive   the AI acting on its own initiative. Protective actions only.

export const RISK = { LOW: "low", MEDIUM: "medium", HIGH: "high" };

// Actions that make the house safer. Always allowed, from anyone.
export function isProtective(device, command) {
  return (
    (device.type === "garage" && command.door === "closed") ||
    (device.type === "lock" && command.locked === true) ||
    (device.type === "water_valve" && command.open === false)
  );
}

export function classify(device, command) {
  switch (device.type) {
    case "light":
    case "fan":
      return RISK.LOW;
    case "thermostat":
    case "water_heater":
      return RISK.MEDIUM;
    case "garage":
      return command.door === "open" ? RISK.HIGH : RISK.MEDIUM;
    case "lock":
      return command.locked === false ? RISK.HIGH : RISK.MEDIUM;
    case "water_valve":
      return command.open === true ? RISK.HIGH : RISK.MEDIUM;
    default:
      return RISK.HIGH;
  }
}

// Hard limits. Returns a reason string if the command must be refused.
export function hardLimit(device, command, ctx) {
  const { limits, registry, lastMove } = ctx;
  if (device.type === "thermostat" && command.target !== undefined) {
    if (command.target < limits.thermostatMinF || command.target > limits.thermostatMaxF) {
      return `Thermostat must stay between ${limits.thermostatMinF}°F and ${limits.thermostatMaxF}°F.`;
    }
  }
  if (device.type === "water_heater" && command.target !== undefined) {
    if (command.target < limits.waterHeaterMinF || command.target > limits.waterHeaterMaxF) {
      return `Water heater must stay between ${limits.waterHeaterMinF}°F and ${limits.waterHeaterMaxF}°F (scald and bacteria protection).`;
    }
  }
  if (device.type === "water_valve" && command.open === true) {
    const wet = registry.byType("leak").filter((s) => s.state.wet);
    if (wet.length) {
      return `Water stays off while a leak is detected (${wet.map((s) => s.name).join(", ")}). Dry the sensor first.`;
    }
  }
  if (device.type === "garage" && command.door) {
    const since = (Date.now() - (lastMove.get(device.id) || 0)) / 1000;
    if (since < limits.garageMinSecondsBetweenMoves) {
      return `The garage door just moved. Wait ${Math.ceil(limits.garageMinSecondsBetweenMoves - since)} seconds.`;
    }
  }
  return null;
}

// Decide: "allow", "confirm" (ask the owner first), or "deny".
export function authorize({ device, command, origin, confirmed, allowOverride }) {
  const risk = classify(device, command);
  if (isProtective(device, command)) return { decision: "allow", risk };

  switch (origin) {
    case "owner":
      return { decision: "allow", risk };
    case "agent":
      if (risk === RISK.HIGH && !confirmed) return { decision: "confirm", risk };
      return { decision: "allow", risk };
    case "automation":
      if (risk === RISK.HIGH && !allowOverride) {
        return { decision: "deny", risk, reason: "Automations can't open doors, unlock locks or turn water back on." };
      }
      return { decision: "allow", risk };
    case "proactive":
      if (risk !== RISK.LOW) {
        return { decision: "deny", risk, reason: "The assistant can only make comfort changes on its own. Ask the homeowner." };
      }
      return { decision: "allow", risk };
    default:
      return { decision: "deny", risk, reason: `Unknown origin "${origin}".` };
  }
}
