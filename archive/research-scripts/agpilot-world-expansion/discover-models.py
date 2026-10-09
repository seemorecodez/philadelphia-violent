import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('../desktop/agpilot-codex').resolve()))
from agpilot_codex.transport import NativeClient,discover
with NativeClient() as client:
 report=discover(client)
 result={'models':[m['model'] for m in report['models'] if m['hidden'] is False], 'model_turns_started':0}
 Path('artifacts/agpilot-world-expansion/visible-models.json').write_text(json.dumps(result,indent=2))
 print(json.dumps(result))
