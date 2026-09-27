# Describing a home for the hologram

Haven draws every home as a hologram from a short description in `config/home.json`: its architectural style, its floors, and the outline of each room. A builder can set this up once per floor plan and reuse it for every home built from that plan. Nothing here affects how Haven controls devices; it only shapes the picture.

## The short version

```json
"building": {
  "style": "farmhouse",
  "floors": [
    { "id": "ground", "name": "Ground floor" },
    { "id": "upper", "name": "Upstairs" }
  ],
  "features": [
    { "type": "driveway", "plan": [0, -5, 6, 5] },
    { "type": "deck", "plan": [20, 2, 4, 6] }
  ]
},
"rooms": [
  { "id": "kitchen", "name": "Kitchen", "plan": [6, 0, 7, 6] },
  { "id": "great", "name": "Great Room", "shape": [[0, 0], [9, 0], [9, 4], [5, 4], [5, 8], [0, 8]] },
  { "id": "bed2", "name": "Bedroom 2", "floor": "upper", "plan": [0, 0, 5, 4] },
  { "id": "office", "name": "Office" }
]
```

## Style

`style` sets the roof, windows, porch and details. Choose the closest:

| Style | Roof | What you'll see |
|---|---|---|
| `modern` | Flat, with a parapet | Wide windows, clean lines |
| `contemporary` | Shed (one slope) | Tall glass, high clerestory windows |
| `farmhouse` | Steep gable | Tall narrow windows, wraparound porch with square posts |
| `craftsman` | Low gable, deep eaves | Front porch with tapered columns, chimney |
| `colonial` | Gable | Evenly spaced windows with shutters, chimney |
| `ranch` | Low hip | Long and low, wide windows |
| `mediterranean` | Low hip | Arched windows |
| `cabin` | Very steep gable | Porch with round posts, chimney |

Override the roof with `"roof": "gable" | "hip" | "shed" | "flat" | "none"` and its steepness with `"pitch"` (rise over half the span, for example 0.5).

## Floors

List `floors` from the bottom up, or give each a `level` (`-1` basement, `0` ground, `1` upstairs). Put each room on its floor with `"floor": "<id>"`. Rooms without a floor go on the ground floor. Floors stack automatically; the explorer shows a button per floor, and looking at a room on a lower floor hides the floors above it.

A hall or landing on a floor with another floor above gets a staircase.

## Rooms

Units are plan units, roughly a metre. `x` grows to the east, `y` to the south (the front of the house, nearest the viewer in the default view).

- **A rectangle:** `"plan": [x, y, width, depth]`.
- **Any outline:** `"shape": [[x, y], [x, y], ...]` in order around the room. L-shaped, angled and odd rooms all work.
- **No plan at all:** leave both out. Haven lays these rooms out for you (garage and laundry to one side, living spaces at the front, bedrooms behind) and the hologram says the layout is estimated. This is how a home with only a room list, such as one brought in from Home Assistant areas, still gets a hologram.

Where two rooms on the same floor share an edge, Haven draws an inner wall with a doorway. Every other edge is an outside wall with the style's windows.

Haven furnishes each room from what it is, taken from `"kind"` or from its id and name: kitchen, living (living, family, great room, den, media), dining, bedroom (primary, bedroom, guest, nursery), bath (bath, powder), closet (closet, pantry), office (office, study), utility (utility, laundry, mudroom), hallway (hall, entry, foyer, landing), gym and garage. Set `"kind"` when the name doesn't say, for example `{ "id": "flex", "name": "Flex Room", "kind": "office" }`.

## Outdoor features

`features` adds `deck`, `patio`, `pool`, `driveway` and `porch`, each with a `plan` rectangle.

## Previewing styles

In the panel, **Screens → Home style** shows the house as any of the sample homes: Two-story Colonial, Farmhouse, Craftsman Bungalow (with an L-shaped living room), Ranch, Contemporary (with deck and pool), Mediterranean (around a courtyard), Cabin, and one built only from a room list. The home's own devices stay in their rooms, so lights and alerts still show. "This home" goes back to the home's own description. The samples live in `web/homes.js`.

## Checking a description

`npm test` includes `test/building.test.js`, which loads this home's config and every sample and checks that rooms sit on real floors and don't overlap. The panel also lists any problems it corrected (an unknown style or floor) in the browser console.
