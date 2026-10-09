# Arch Street Blender master

Open arch-street-master.blend with Blender. SOURCE_REFERENCE contains retained
photographic source2740; GAME_DETAIL contains the previously photo-traced relief.
Scene units are metres. Geographic origin is stored on scene and objects; keep
vertices local. Do not reapply geographic offsets in Blender.

Edit GAME_DETAIL; retain SOURCE_REFERENCE as evidence. Export selected GAME_DETAIL
objects as GLB with Y-up conversion enabled. Never export the source collection as
part of the replacement detail layer. The existing native reference actor remains.

Current export: arch-street-detail.glb. Roundtrip check confirms29924 triangles and
bounds within0.000001m; this does not validate materials, normals or native render.
No art improvement is claimed from this import/export operation alone.

Next: author and visually inspect a specific architectural improvement in this
master, import into a separate Unreal asset path, compare at the existing Arch
Street player camera, and retain only if fidelity and measured performance pass.
Ordinary neighborhood kit designs may be interpreted; historical landmarks need
individual reference work. No Ollama or AGPilot assignments.
