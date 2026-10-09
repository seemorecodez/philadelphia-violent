import bpy
import json
from pathlib import Path

project = Path(__file__).resolve().parents[1]
(project / 'artifacts' / 'blender-runtime.json').write_text(json.dumps({
    'version': bpy.app.version_string,
    'binary': bpy.app.binary_path,
    'background': bpy.app.background,
}, indent=2))
