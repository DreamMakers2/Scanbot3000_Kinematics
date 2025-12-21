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
- Toggles: Lock to origin, Axis labels, Coordinate labels
- Mouse: Left drag to orbit, Middle button drag to pan, Wheel to zoom
- Keyboard: WASD to move the view target
- Viewcube: Click faces to snap view, use the selector to switch camera mode

## Python Prototype

Location: `Scanbot3000_Kinematics.py`

The original matplotlib prototype is kept for reference and comparison with the
web app.
