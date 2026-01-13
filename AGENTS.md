Current Status
- Working toward matching dgreenheck/threejs-procedural-planets visuals on a plane (not sphere) with live-configurable settings.
- Added a settings panel in `webapp/index.html` with sliders for all config items and live wiring in `webapp/app.js`.
- Ported repo-like params into `planetSettings` (terrain, layers, lighting direction/color, atmosphere, bump, bloom).
- Added shader strings in `webapp/app.js` (`planetNoiseFunctions`, `terrainVertexShader`, `terrainFragmentShader`, `atmosphereVertexShader`, `atmosphereFragmentShader`) based on the repo GLSL.
- Created `createHeightmapTerrain()` to build a plane with ShaderMaterial using the repo uniforms (heightmap + ridged/fractal/simplex noise), but the integration is mid-change.
- Post-processing bloom wired via EffectComposer in `webapp/index.html` and `webapp/app.js`.

Objective (Next Session)
- Finish shader-based pipeline: ensure `rebuildTerrain()` uses the new `createHeightmapTerrain()` (ShaderMaterial) and remove any leftover color/Phong material logic.
- Use `updateTerrainUniforms()` to update shader uniforms instead of full rebuilds where possible; keep rebuild only when geometry changes.
- Implement `updateTerrainClearance()` to keep the plane below the wooden platform (no visible cutouts).
- Verify no remaining references to the old heightmap-derived vertex colors, `applyTerrainColors()`, or `terrainUniforms` unused paths.
- Remove the current atmosphere effect.
- Bring back the old volumetric fog.
- Move the terrain down a bit.
- Set ambient lighting default to 2.2.

Notes
- No tests run.
