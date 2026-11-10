export interface Theme {
  bgVoid: string;
  bgPanel: string;
  bgPanelRaised: string;

  wallInterior: string;
  wallTrim: string;
  wallExterior: string;

  floorInside: string;

  shelfFrame: string;
  shelfDeck: string;

  routeLine: string;
  routeLineOutline: string;
  pin: string;
  startBeacon: string;

  textDim: string;
  textMid: string;
  textBright: string;
  accent: string;

  wallHeight: number;
}

// Same commercial-hardware-store identity (gray, white, safety-yellow) in
// two finishes: a bright daytime facility, and a dark one where the yellow
// neon roofline and racking are the light sources. Both share the same key
// shape so every consumer can just read from whichever is active.
export const lightTheme: Theme = {
  bgVoid: "#cfd3d6", // page/scene background -- cool overhead facility light
  bgPanel: "#ffffff", // side panel background
  bgPanelRaised: "#eef0f2", // inputs/cards on the panel

  wallInterior: "#eef1f4", // cool white interior panel, not warm paint
  wallTrim: "#ffd400", // yellow neon tube along the roofline, following the building's shape
  wallExterior: "#c7ccd1", // plain flat exterior face, no texture

  floorInside: "#ffffff", // the whitest white -- no grid, no tiling, no exterior apron

  shelfFrame: "#ffd400", // safety-yellow steel racking uprights, lit from within
  shelfDeck: "#eef0f2", // cool white shelf decking

  routeLine: "#ffd400", // wayfinding line -- painted-yellow floor line
  routeLineOutline: "#1a1a1a", // black edge, like real hazard/wayfinding tape
  pin: "#ffd400",
  startBeacon: "#2e7d32", // safety green -- "you are here", reads as go/safe

  textDim: "#7b828a",
  textMid: "#454d56",
  textBright: "#1c2126",
  accent: "#e0ab00", // slightly deeper yellow for UI text-on-white legibility

  wallHeight: 19, // halved from 38 -- the pin/route heights in TripView.tsx are independent, tied to the racking height instead
};

// A real gray ramp, same idea as the light theme's spread from mid-gray void
// to near-white walls/decking -- just inverted, not everything crushed to
// the same near-black. Steps are deliberately wide (not subtle) so each
// surface is unmistakable at a glance, not just technically-different hex.
export const darkTheme: Theme = {
  bgVoid: "#08090a", // darkest step -- the void outside the building
  bgPanel: "#131619",
  bgPanelRaised: "#1e2226",

  wallInterior: "#6b7480", // clearly lighter than the floor/exterior so walls read as their own surface
  wallTrim: "#ffd400", // the neon reads even stronger against a dark building
  wallExterior: "#3d444c", // a step up from the void, a step below the interior

  floorInside: "#242830", // dark polished concrete -- distinct step, well below the walls

  shelfFrame: "#ffd400",
  shelfDeck: "#8b95a1", // lightest gray step so racking clearly stands off the walls

  routeLine: "#ffd400",
  routeLineOutline: "#000000",
  pin: "#ffd400",
  startBeacon: "#3fae46",

  textDim: "#8a9198",
  textMid: "#b8bfc6",
  textBright: "#f2f4f6",
  accent: "#ffd400",

  wallHeight: 19,
};
