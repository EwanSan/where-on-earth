# Where On Earth

A geography quiz game that drops a pin somewhere on the world map and challenges you to name the country or capital city.

## How to play

1. A marker appears somewhere on the satellite map
2. Type the name of the **country** (or **capital**, depending on the mode)
3. Press **OK** or hit **Enter** to submit, **Skip** or **Escape** to pass
4. The correct country is highlighted — green for correct, yellow for wrong or skipped
5. Chain correct answers to build your streak

**Accepted answers:** both English and French names are valid.

## Game modes

| Mode | Challenge |
|------|-----------|
| **Country** | Identify the country where the pin is located |
| **Capital** | Identify the capital city of the highlighted country |

## Tech stack

- [Leaflet](https://leafletjs.com/) — interactive map
- [Turf.js](https://turfjs.org/) — random point generation inside country polygons
- [geo-countries](https://github.com/datasets/geo-countries) — country GeoJSON data
- Esri World Imagery — satellite tile layer
- Vanilla JS (ES modules), no build step required

## Run locally

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Project structure

```
where-on-earth/
├── index.html       # App shell and HUD layout
├── css/
│   └── style.css    # Styles
└── js/
    ├── game.js      # Game loop, modes, and map logic
    ├── data.js      # French country names and aliases
    ├── capitals.js  # Capital city data and aliases
    └── geo.js       # Geometry utilities
```
