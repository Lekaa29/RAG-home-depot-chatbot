// Realistic commercial-hardware-store palette: gray concrete floor, bone
// white shelving, light warehouse walls, and safety-yellow as the one
// accent color -- construction-site yellow, used the way a real store uses
// it (racking, signage stripes, wayfinding), not scattered everywhere.
export const theme = {
  bgVoid: "#dcdad2", // page/scene background -- soft overhead warehouse light
  bgPanel: "#ffffff", // side panel background
  bgPanelRaised: "#f4f2ec", // inputs/cards on the panel

  wallInterior: "#f7f5f0", // fully white interior paint
  wallTrim: "#f5c518", // painted safety-yellow signage band along the wall top
  brickBase: "#d9c39a", // desert-cream brick, exterior face
  brickMortar: "#b6996c", // mortar lines in the brick texture

  floorOutside: "#9a988f", // sealed exterior concrete/apron
  floorInside: "#c7c5bc", // lighter than outside, but a real gray, not near-white
  gridLine: "#bcbab0", // faint control-joint lines, tuned against the interior floor
  gridSection: "#b0aea3",

  shelfFrame: "#f5c518", // safety-yellow steel racking uprights
  shelfDeck: "#ece6d8", // bone-white shelf decking

  routeLine: "#f5c518", // wayfinding line -- painted-yellow floor line
  routeLineOutline: "#1a1a1a", // black edge, like real hazard/wayfinding tape
  pin: "#f5c518",
  startBeacon: "#2e7d32", // safety green -- "you are here", reads as go/safe

  textDim: "#8a8578",
  textMid: "#5a5648",
  textBright: "#2a2822",
  accent: "#e0ab00", // slightly deeper yellow for UI text-on-white legibility

  wallHeight: 19, // halved from 38 -- the pin/route heights in TripView.tsx are independent, tied to the racking height instead
} as const;
