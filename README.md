# Scanbot3000 Kinematics

Interactive visualization of Scanbot3000 kinematics, with both a legacy Python
matplotlib prototype and a Three.js web app.

## Web App (Three.js)

Location: `webapp/`

Quick start:

```bash
cd webapp
python -m http.server
```

Open `http://localhost:8000/index.html`.

Notes:
- Uses the Three.js CDN (requires internet access).
- The web app is standalone HTML/CSS/JS (no build step).

Controls:
- Sliders: Y-axis, X-axis, P-axis (deflection), R-axis (rotation)
- Toggles: Lock to origin, Axis labels, Coordinate labels (off by default)
- Direct control: Enable Direct Control and set the interval
- Scan path: Scan radius (default 320), waypoints, repeat cycles, start direction,
  dry run, progress/estimate, start button
- Controls panel: Click the title to collapse/expand (collapsed by default)
- Mouse: Left drag to orbit, Middle button drag to pan, Wheel to zoom
- Keyboard: WASD to move the view target
- Viewcube: Click faces to snap view, use the selector to switch camera mode
- Terrain settings (WIP): If the settings panel is enabled, it exposes live sliders
  for terrain, layer colors, lighting, bump, and bloom.

## Procedural Terrain (WIP)

The Three.js scene includes a shader-driven terrain plane inspired by
dgreenheck/threejs-procedural-planets. It blends heightmap + ridged/fractal/simplex
noise with layered colors, bump, and post-processing bloom. The shader pipeline
is mid-change, so expect rebuilds and missing wiring. See `AGENTS.md` for current
integration notes.

## Scan Path Mode

The scan path is a quarter-circle arc around the scan origin in the XY plane.
If the nominal arc exceeds axis limits, the path is clamped to the bounds,
creating straight segments along the limits before returning to the arc.
The resulting path is sampled into the configured number of waypoints.

At each waypoint the system:
- Moves X/Y/P to the waypoint (P is locked to the scan origin)
- Rotates the R axis by 360°
- Proceeds to the next waypoint

The path is traversed forward, then reversed back to the start, repeating for
the configured number of cycles. On the reverse path, the R rotation runs in
the opposite direction to avoid accumulating position on one side.

Completion is gated using the coordinated motion status (`/coordstatus`), and
dry run executes the same sequence in software without calling the API.

## Python Prototype

Location: `Scanbot3000_Kinematics.py`

The original matplotlib prototype is kept for reference and comparison with the
web app.
