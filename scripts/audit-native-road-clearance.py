"""Measure real road-face centroids against the retained terrain triangles."""
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT/'Unreal/Philadelphia/Content/SourceData'


def audit():
    rows = []
    for entry in json.loads((DATA/'manifest.json').read_text())['cells']:
        cell = json.loads((DATA/(entry['id']+'.json')).read_text())
        ground = cell['groups']['ground']
        heights = {(round(ground[i]/100), round(-ground[i+1]/100)): ground[i+2]
                   for i in range(0, len(ground), 3)}
        def terrain(east, north):
            x, y = math.floor(east/10)*10, math.floor(north/10)*10
            if (x+10,y+10) not in heights:
                return None
            u, v = (east-x)/10, (north-y)/10
            h00,h10,h11,h01 = [heights[k] for k in [(x,y),(x+10,y),(x+10,y+10),(x,y+10)]]
            return h00*(1-u)+h10*(u-v)+h11*v if u >= v else h00*(1-v)+h01*(v-u)+h11*u
        values = cell['groups'].get('road', [])
        for i in range(0, len(values), 9):
            x,y,z = (sum(values[i+j+a] for j in (0,3,6))/3 for a in range(3))
            base = terrain(x/100,-y/100)
            if base is not None:
                rows.append({'cell':entry['id'],'triangle':i//9,'clearance_cm':z-base,'point':[x,y,z]})
    rows.sort(key=lambda r:r['clearance_cm'])
    return {'sample':'Each retained native road triangle centroid against actual terrain mesh',
            'samples':len(rows),'belowGroundCount':sum(r['clearance_cm'] < -.01 for r in rows),
            'minimumClearanceCm':rows[0]['clearance_cm'],
            'medianClearanceCm':rows[len(rows)//2]['clearance_cm'],
            'worstTen':rows[:10],
            'limits':['Centroid samples do not prove full triangle clearance','This is geometry diagnosis, not rendered or gameplay acceptance']}


if __name__ == '__main__':
    result=audit()
    if len(sys.argv)>1:
        (ROOT/sys.argv[1]).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='worstTen'}))
