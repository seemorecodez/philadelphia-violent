from pathlib import Path
p=Path('Unreal/Philadelphia/Scripts/extract_nearby_sources.py');s=p.read_text();s=s.replace('import hashlib','import argparse\nimport hashlib',1)
s=s.replace('def main():\n', '''def main():
    global OUT
    parser=argparse.ArgumentParser()
    parser.add_argument('--radius',type=float,default=70)
    parser.add_argument('--output',choices=['Nearby','DowntownExpansion'],default='Nearby')
    args=parser.parse_args()
    if not 0<args.radius<=200:raise ValueError('Source radius must be within 200m')
    OUT=ROOT/'Unreal/Philadelphia/SourceAssets'/args.output
    excluded=set()
    if args.output=='DowntownExpansion':
        existing=ROOT/'Unreal/Philadelphia/SourceAssets/Nearby/manifest.json'
        excluded={item['id'] for item in json.loads(existing.read_text())['assets']}
''',1)
s=s.replace('if distance <= 70:',"if distance <= args.radius and PurePosixPath(name).stem not in excluded:")
p.write_text(s)
