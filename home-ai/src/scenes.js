// A scene in a few plain words, for the panels' scene cards: what pressing it
// will do, read from the scene's own actions (never a description that could
// drift from what it really does).
//   { device: "light.kitchen", command: { on: true, brightness: 90 } } -> "Kitchen 90%"
//   { device: "*lock", command: { locked: true } }                      -> "doors locked"

const short = (name) => name.replace(/ (Lights?|Lock)$/, "");

export function describeScene(scene, deviceName = (id) => id) {
  const parts = [];
  for (const { device, command: c } of scene?.actions || []) {
    const all = device.startsWith("*") ? device.slice(1) : null;
    const type = all || device.split(".")[0];
    const name = all ? null : short(deviceName(device));
    let text = null;
    if (type === "light") text = all ? (c.on === false ? "lights off" : "lights on") : c.on === false ? `${name} off` : `${name} ${c.brightness ?? 100}%`;
    else if (type === "fan") text = all ? (c.on === false ? "fans off" : "fans on") : c.on === false ? `${name} off` : `${name} on`;
    else if (type === "garage") text = c.door === "closed" ? "garage closed" : c.door === "open" ? "garage open" : null;
    else if (type === "lock") text = c.locked === false ? `${all ? "doors" : name} unlocked` : `${all ? "doors" : name} locked`;
    else if (type === "climate") text = c.setback ? "energy-saving temperature" : c.target != null ? `${c.target}°F` : c.mode === "off" ? "climate off" : null;
    else if (type === "water_heater") text = c.on === false ? "water heater off" : c.target != null ? `water heater ${c.target}°F` : null;
    if (text) parts.push(text);
  }
  const s = parts.join(", ");
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}
