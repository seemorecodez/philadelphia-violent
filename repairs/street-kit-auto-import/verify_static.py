from pathlib import Path
import fnmatch, json, re, hashlib
root=Path(__import__('sys').argv[1]).resolve()  # Explicit local project path required.
out=Path(__file__).parent
config=(out/'candidate/Unreal/Philadelphia/Config/DefaultEditorPerProjectUserSettings.ini').read_text()
engine=Path(r'C:\Program Files\Epic Games\UE_5.7\Engine\Config\BaseEditorPerProjectUserSettings.ini').read_text()
remove=next(x[1:] for x in config.splitlines() if x.startswith('-AutoReimport'))
assert '+'+remove in engine, 'Exact inherited rule no longer matches engine config'
add=next(x for x in config.splitlines() if x.startswith('+AutoReimport'))
patterns=re.findall(r'Wildcard="([^"]+)"',add)
def allowed(name):return not any(fnmatch.fnmatchcase(name,p) for p in patterns)
content=root/'Unreal/Philadelphia/Content'
files=list((content/'SourceData').rglob('*.json'))
assert len(files)>0
assert all(not allowed(p.relative_to(content).as_posix()) for p in files)
for sample in ['Philadelphia/Assets/lamp.fbx','Philadelphia/Textures/brick.png','SourceData/district-backdrop.png','Tables/quests.json']:
 assert allowed(sample),sample
assert not allowed('Localization/Game/en.json')
kit=json.loads((content/'SourceData/street-kit.json').read_text())
assert len(kit['assets'])==12
for item in kit['assets']:
 assert (content/(item['mesh'].split('.')[0].removeprefix('/Game/')+'.uasset')).is_file()
for name,digest in json.loads((out/'baseline-hashes.json').read_text()).items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest, 'Original changed since baseline: '+name
print(f'PASS: inherited-rule replacement; {len(files)} runtime JSON paths excluded; 4 normal import controls retained; localization exclusion retained; 12 mesh package references present; 3 original file hashes unchanged.')
print('Coverage: static config/data checks using a wildcard model, not Unreal runtime validation.')
