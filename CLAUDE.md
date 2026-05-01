# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CSE352 Computer Graphics — Homework #1: Flight Simulator (due May 2, 2026).
Entry point must be `simulator.html`. All rendering uses WebGL via plain HTML/JS (no build step, no bundler).

## Running

Open `simulator.html` directly in a browser. No server required unless texture loading triggers CORS, in which case:

```
python -m http.server 8000
```

then visit `http://localhost:8000/simulator.html`.

## Architecture

The simulator is structured around three concerns:

**Terrain generation** — `get_patch(xmin, xmax, zmin, zmax)` returns a triangulated grid over the xz-plane with y-coordinates randomly perturbed in (−2, 2). Ground level is y=0: below is water (blue), at/near ground is green, above transitions green→brown→white with altitude.

**Camera / flight model** — The illusion of flight is achieved by moving the camera, never by transforming geometry. The camera tracks: position (altitude constrained to 2.5–3.5), orientation via pitch/roll/yaw (each constrained to −90°…90°), and speed (0 to S_max). Key bindings:
- `W/S` pitch, `A/D` yaw, `Q/E` roll
- Arrow up/down: speed
- `1–6` / `Shift+1–6`: adjust left/right/top/bottom/near/far of the viewing frustum
- `V`: cycle render mode (points → wireframe → faces)
- `C`: cycle shading (flat → smooth → Phong)
- `Escape`: quit

**Infinite terrain** — When the plane approaches a patch boundary, new patches are generated and appended. Patches behind the plane (unreachable due to rotation constraints) can have their GPU buffers reused rather than allocating new ones.

## Reference materials

`References/` contains the course slide ZIPs (HelloTriangle, Shaders, Transformation, Textures, CoordinateSystems, Camera, Lighting I/II, Ray Tracing). All WebGL code — shader patterns, matrix math, buffer setup, etc. — must be drawn from these references. If anything outside these references is needed (e.g. a third-party library or API not covered in the slides), ask the user for approval before using it.

## Git commits

Do not add Claude as a co-author in any git commit messages.
