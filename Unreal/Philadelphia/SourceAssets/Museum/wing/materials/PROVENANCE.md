# Museum courtyard facade material candidate

`cleaned-facade-v1.png` was produced with the built-in image-generation tool on
September 13, 2026. It is an AI-assisted cleanup/detail interpretation of the
retained public museum atlas, not an original site photograph, surveyed texture,
photogrammetry capture or new evidence of the building's exact material.

Input: `artifacts/unreal/museum-wing-reference-inspection.png`, an inspection crop
of the immutable source atlas, original rectangle (2390,990)-(2590,1500), enlarged
2x for inspection. The original GLB/JPEG remains unchanged. Window plan and source
wall geometry are authored from the original, not inferred from this output.

Exact built-in edit prompt:

> Edit this existing PUBLIC historic Philadelphia Museum of Art facade texture reference for native 3D game material authoring. This is an architectural texture cleanup, NOT a concept rendering or a new building design. Preserve the input's unusual sideways orientation, exact framing/aspect ratio, window positions, window count, silhouettes, stone surround widths, coursing positions, and all major architecture. Do not rotate or recompose. Remove the tree branches/leaves and their cast shadows obscuring the stone wall and windows. Reconstruct obscured patches by continuing the adjacent established window and masonry patterns, with no new architectural features. Remove broad directional lighting and dark tree staining caused by photographed shadows while retaining authentic aged warm gray limestone color variation, fine porous mineral grain, subtle joint recesses and restrained natural patina. Restore convincing high-resolution masonry surface detail without sharpening halos. Uniform diffuse overcast illumination appropriate for a base-color texture; no sunlight, ambient occlusion painted as black shadows, dramatic contrast or vignette. Keep the black/dark window glazing and visible metal muntin layouts; no reflected landscapes, people or interiors. Keep every opening aligned with the original; the result will be projected onto matching 3D window geometry. Do not add text, labels, vehicles, vegetation, ornament, extra windows, or a border. Output a single cleaned high-detail texture image, same orientation and composition.

Review: tree imagery removed and masonry character improved over the rejected
uniform procedural wall. The generated image retains some local directional
shading and changes small masonry/window details. It is a material candidate;
native projection/alignment and visual acceptance must be checked. Do not present
the standalone generated image as an actual Unreal rendering.
