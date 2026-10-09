from pathlib import Path
p=Path('ACCEPTANCE.md');s=p.read_text();start=s.index('## September 23:');end=s.index('Defining world test:',start)
s=s[:start]+'''## Current correction: neighborhood identity and Blender production

Ordinary buildings need neighborhood architectural identity, not exact individual
facade reconstruction. Retain real footprints, placement, approximate dimensions
and elevation. Use neighborhood-reference-guided architectural kits with variation.
Source IDs track placement and prevent duplication; they do not certify replicas.
Individually research and model landmarks and historically significant structures,
including neighborhood-defining buildings. Flag uncertain significance for review.

This supersedes the earlier requirement for a complete individual reconstruction
packet for every ordinary house. Keep source provenance and distinguish measured,
derived, interpreted and unknown information. Generated/imported counts are not
accepted visual or gameplay completion.

Frank discontinued Ollama and AGPilot for this project. Do not launch new work
through either. Preserve previous evidence without treating it as accepted output.
Use editable Blender masters and native Unreal inspection. Prove one convincing
real block before repeating its architectural kit broadly; citywide scope remains.

''' +s[end:];p.write_text(s)
p=Path('AGENTS.md');p.write_text(p.read_text()+'''\n## Latest user direction: Blender and neighborhood identity\n\nDo not use Ollama or AGPilot for new project assignments. Use editable Blender\nassets and native Unreal validation. Ordinary buildings retain real layout and\napproximate dimensions but need neighborhood identity, not exact facades. Landmarks\nand historically significant structures require individual recognizable treatment.\nThis supersedes earlier per-house reconstruction and agent-usage requirements.\n''')
