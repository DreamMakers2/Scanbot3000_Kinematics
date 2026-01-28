# Scanbot3000 Kinematics

Interactive visualization of Scanbot3000 kinematics in Three.js. The web UI can run
standalone for visualization or connect to the Raspberry Pi FastAPI service for live
positioning, motion, and range sampling.

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
- API features use the FastAPI service documented in `context from raspberry pi API/api.md`.

### API Configuration (optional)
Update `apiBaseUrl` in `webapp/app.js` to point at your API host (default is
`http://192.168.178.222:8001/api`). When the API is offline, the UI stays in
visualization mode and disables API-driven controls.

### Interface Overview
- Top bar: Driver Status, Driver Settings, Home (Z) popups/actions.
- Status: API online/offline timer plus API Pos readout (x/z/p/r + status).
- Controls panel (collapsed by default): axis sliders, direct control interval, and view toggles.
- Axis Limits panel: per-axis velocity/accel steps with Apply (persisted in localStorage).
- Scan Path panel: radius, waypoints, repeat cycles, start direction, start at center, dry run,
  progress + estimated run time.
- Point Cloud panel (collapsible): start/stop/clear range sampling and optional laser guide.
- Emergency Stop sends /stop to x/z/p/r/x1/x2.

### Interaction
- Drag handles in the scene to adjust Z, X, P, and R (dragging the base sphere moves X+Z).
- Mouse: left drag orbit, middle drag pan, wheel zoom.
- Keyboard: WASD pans the view target.
- Viewcube: click faces to snap view; camera selector toggles perspective/orthographic.

## Direct Control

When enabled, the UI periodically sends `/moveabs` updates based on the current slider
values. Direct control is only available when the API reports `status=ok` and the stage
is homed.

## Scan Path Mode

The scan path is a quarter-circle arc around the scan origin in the XZ plane.
If the nominal arc exceeds axis limits, the path is clamped to the bounds,
creating straight segments along the limits before returning to the arc.
The resulting path is sampled into the configured number of waypoints.

At each waypoint the system:
- Moves X/Z/P to the waypoint (P is locked to the scan origin)
- Rotates the R axis by 360 degrees
- Proceeds to the next waypoint

The path is traversed forward, then reversed back to the start, repeating for
the configured number of cycles. On the reverse path, the R rotation runs in
the opposite direction to avoid accumulating position on one side.

Scan execution pauses direct control and forces lock-to-origin while active.
Dry run performs the same sequence in software without calling the API.

## Point Cloud Mode

Point Cloud sampling triggers `/measure` on axis R and listens to `/ws/axis/r`
for range samples. Each range value is projected from the current arm angle to
build an in-scene point cloud (up to 20k points). Use Clear to reset the cloud
and Show Laser to visualize the measurement ray.
