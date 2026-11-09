# Open-source research and integration notes

This repository's smart drawing engine is a vector-stroke pipeline. The following references were evaluated for techniques, code reuse, and training data. They are not all drop-in libraries, and the app does not bundle large research datasets.

## Applied in Rasem

- Adaptive, corner-preserving filtering: implemented in `js/auto-correction.js`. The filter is original integration code, retaining point count, pressure, timestamps, endpoints, and deliberate corners.
- Sketch recognition: the existing `js/shape-recognition.js` includes ShortStraw-inspired corner candidates and geometric fitting.
- Pressure-aware stroke construction: the existing `StrokeBuilder` remains responsible for brush-specific outlines. Calligraphy and feather/custom textured brushes are excluded from geometric correction to protect nib shape and texture.

## Evaluated references

- **Perfect Freehand** — https://github.com/steveruizok/perfect-freehand  
  Useful reference for pressure-sensitive stroke outlines. It generates stroke geometry rather than correcting the user's centreline, so it is not substituted for Rasem's brush renderer.
- **PaleoSketch** — research on sketch primitive recognition and geometric fitting. It is a method/paper reference, not a verified drop-in dependency in this repository.
- **ShipShape** — research on beautifying sketches with geometric relationships/constraints. Its constraint-based ideas are relevant to multi-stroke drawings; it is not treated as a single-stroke smoothing library.
- **Elasticurves** — research direction for speed-aware curve beautification. The correction filter uses drawing speed as a small adaptive factor, without claiming to reproduce the paper's full algorithm.
- **Open Vectorizer** — https://github.com/vardirhq/open-vectorizer  
  MIT-licensed Rust/WASM raster-to-SVG project. Its primitive fitting and render-back comparison are relevant for future raster/vector conversion, but its pipeline accepts raster artwork, not live pointer stroke samples.
- **Quick, Draw! Dataset** — https://github.com/googlecreativelab/quickdraw-dataset  
  50 million vector drawings in 345 categories; dataset is CC BY 4.0. It is suitable for recognition experiments, but does not provide paired rough/corrected targets for direct beautification training. The full dataset is not bundled in this mobile app. Attribution is required for any redistributed samples.
- **SketchGraphs** — https://github.com/PrincetonLIPS/SketchGraphs  
  15 million CAD sketches with geometric constraint graphs. Original sketch creators retain copyright; Onshape terms apply. Do not redistribute or bundle the dataset without reviewing those terms. Its graph/constraint concepts are relevant to future multi-stroke constraint solving.
  
## Licensing and scope

No third-party source files or datasets are copied into this commit. References above are documented to make the technical boundary explicit. A future direct code import must first verify the exact upstream revision, license, attribution requirements, browser/Android compatibility, and bundle-size impact.

## Validation

Run `npm test` and `npm run build`. Automated tests cover endpoint preservation, corner preservation, jitter reduction, pressure/time preservation, and attribute transfer. Visual testing on Android with each brush preset is still required.
