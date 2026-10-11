// The panel's icons: SVG path data (24x24), drawn with svg() from dom.js.
import { svg } from "./dom.js";

export const ICON = {
  light: "M9 21h6v-1H9v1Zm3-19a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Z",
  fan: "M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm.5-9C17 2 17.1 8.1 13 9.5c1.4.9 2 2.2 2 2.5 4-1.8 9-.2 9 4.5 0 3.3-6.4 3.7-9.5-1.2-.4 1.6-1.4 2.6-2 2.9 1.3 4.2-1.8 8.3-5.9 5.7-2.9-1.8-.2-7.7 5.1-8.7C10.3 14.4 9.4 13.3 9 12.5 5 14.5 0 12.7 0 8c0-3.2 6.1-3.4 9.3 1.2C9.7 7.7 10.7 6.7 11.3 6.3 10 2.1 10.2 2 12.5 2Z",
  climate: "M15 13V5a3 3 0 0 0-6 0v8a5 5 0 1 0 6 0Zm-3 7a3 3 0 0 1-1.5-5.6l.5-.3V5a1 1 0 0 1 2 0v9.1l.5.3A3 3 0 0 1 12 20Z",
  water: "M12 2s-7 7.6-7 12.5A7 7 0 0 0 19 14.5C19 9.6 12 2 12 2Zm0 18a5 5 0 0 1-5-5h2a3 3 0 0 0 3 3v2Z",
  heater: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 5c-1 1.5-2.5 3-2.5 5a2.5 2.5 0 0 0 5 0c0-2-1.5-3.5-2.5-5Z",
  garage: "M12 3 2 8v13h3v-9h14v9h3V8L12 3Zm-5 11v2h10v-2H7Zm0 4v2h10v-2H7Z",
  lock: "M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z",
  shield: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3Z",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
  door: "M6 2h12v20H6V2Zm2 2v16h8V4H8Zm6 7h1.5v2H14v-2Z",
  home: "M12 3 2 11.5h3V20h5.5v-5.5h3V20H19v-8.5h3L12 3Z",
  sparkle: "M11 2l2.3 6.2L19.5 10.5 13.3 12.8 11 19l-2.3-6.2L2.5 10.5l6.2-2.3L11 2Zm8 11 1 2.5 2.5 1-2.5 1L19 20l-1-2.5-2.5-1 2.5-1L19 13Z",
  motion: "M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.8 8.9 7 22h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3a7.3 7.3 0 0 0 5.5 2.5v-2a5.3 5.3 0 0 1-4.6-2.6l-1-1.6a2 2 0 0 0-1.7-.9 2 2 0 0 0-.7.1L5 7.3V12h2V8.6l1.8-.7-1 1Z",
  bell: "M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z",
};

// Weather icons, one per condition (night swaps the sun for the moon).
export const WX = {
  sun: "M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm-1-16h2v3h-2V1Zm0 19h2v3h-2v-3ZM1 11h3v2H1v-2Zm19 0h3v2h-3v-2ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1Zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4ZM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4Z",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  cloud: "M7 19a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 10H7Z",
  partly: "M8.5 3a4.5 4.5 0 0 0-4.3 5.8 5.2 5.2 0 0 1 6.9-.9A7 7 0 0 1 13 6.5 4.5 4.5 0 0 0 8.5 3Zm0 18a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 18.6 11 4 4 0 0 1 18 21H8.5Z",
  rain: "M7 15a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 5a4.5 4.5 0 0 1-.5 10H7Zm1 2h2l-1 4H7l1-4Zm4 0h2l-1 4h-2l1-4Zm4 0h2l-1 4h-2l1-4Z",
  snow: "M7 15a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 5a4.5 4.5 0 0 1-.5 10H7Zm1 3a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 8 18Zm4 1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm4-1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z",
  storm: "M7 15a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 5a4.5 4.5 0 0 1-.5 10H7Zm5.5 1H15l-1.7 2.8H15L11 23l.9-3.6H10l2.5-3.4Z",
  fog: "M3 7h18v2H3V7Zm2 4h14v2H5v-2Zm-2 4h18v2H3v-2Zm4 4h10v2H7v-2Z",
  wind: "M3 8h11a2.5 2.5 0 1 0-2.5-2.5h-2A4.5 4.5 0 1 1 14 10H3V8Zm0 4h15a3 3 0 1 1-3 3h2a1 1 0 1 0 1-1H3v-2Z",
};
export function wxIcon(condition, isDay = true) {
  const d = { clear: isDay ? WX.sun : WX.moon, "partly-cloudy": isDay ? WX.partly : WX.cloud, cloudy: WX.cloud, fog: WX.fog, drizzle: WX.rain, rain: WX.rain, sleet: WX.snow, snow: WX.snow, storm: WX.storm, wind: WX.wind }[condition] || WX.cloud;
  const s = svg(d);
  s.classList.add("wx-ic", `wx-${condition}${condition === "clear" && !isDay ? "-night" : ""}`);
  return s;
}

// Icons for the designed screens, the scenes and the rooms.
export const DI = {
  sunrise: "M11 2h2v4h2.5L12 9.5 8.5 6H11V2ZM3.5 11l1.4-1.4 2 2-1.4 1.4-2-2Zm13.6.6 2-2 1.4 1.4-2 2-1.4-1.4ZM2 18h4.2a6 6 0 0 1 11.6 0H22v2H2v-2Zm6.3 0h7.4a4 4 0 0 0-7.4 0Z",
  moon: WX.moon,
  film: "M3 4h18v16H3V4Zm2 2v2h2V6H5Zm12 0v2h2V6h-2ZM5 11v2h2v-2H5Zm12 0v2h2v-2h-2ZM5 16v2h2v-2H5Zm12 0v2h2v-2h-2ZM9 6v12h6V6H9Z",
  exit: "M10 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9v-2h9V5h-9V3Zm-1 5 1.4 1.4L8.8 11H16v2H8.8l1.6 1.6L9 16l-4-4 4-4Z",
  grid: "M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z",
  camera: "M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z",
  person: "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5Z",
  sliders: "M3 5h10v2H3V5Zm14 0h4v2h-4V5Zm-2-2h2v6h-2V3ZM3 11h4v2H3v-2Zm8 0h10v2H11v-2Zm-2-2h2v6H9V9Zm-6 8h10v2H3v-2Zm14 0h4v2h-4v-2Zm-2-2h2v6h-2v-6Z",
  sofa: "M5 6h14a2 2 0 0 1 2 2v2.2a2.5 2.5 0 0 0-1 .3V8H4v2.5a2.5 2.5 0 0 0-1-.3V8a2 2 0 0 1 2-2ZM1 13a2 2 0 0 1 4 0v2h14v-2a2 2 0 0 1 4 0v6h-2v1h-2v-1H5v1H3v-1H1v-6Z",
  bed: "M2 6h2v7h7V8h8a3 3 0 0 1 3 3v9h-2v-3H4v3H2V6Zm3 3.5a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z",
  pot: "M3 10h18v2h-1v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4H3v-2Zm5-6c1 1 1 2 0 3h1.6c1-1 1-2 0-3H8Zm4 0c1 1 1 2 0 3h1.6c1-1 1-2 0-3H12Z",
  tree: "M12 2 6 10h3l-4 6h6v6h2v-6h6l-4-6h3l-6-8Z",
  utility: "M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm5 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 15h6v1.6H9V15Zm0 3h6v1.6H9V18Z",
};
export const SCENE_ICON = { morning: DI.sunrise, away: DI.exit, home: ICON.home, goodnight: DI.moon, movie: DI.film };
export const ROOM_ICON = { kitchen: DI.pot, living: DI.sofa, primary: DI.bed, bedroom: DI.bed, hallway: ICON.door, garage: ICON.garage, utility: DI.utility, exterior: DI.tree, bath: ICON.water };
export const roomIcon = (r) => ROOM_ICON[r.kind] || ROOM_ICON[r.id] || ICON.home;
