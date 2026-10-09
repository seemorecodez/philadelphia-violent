"""Edit actual local gameplay captures into a silent progress preview.

No generated gameplay, speed changes, frame interpolation or replaced audio.
The 30 fps export repeats available frames; it is not evidence of game FPS.
Run with the available Python 3.11 imageio_ffmpeg package.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import imageio_ffmpeg

root=Path(__file__).resolve().parents[1]
folder=root/'artifacts/videos'
inputs=[folder/'philadelphia-gameplay-2026-09-11.mp4',folder/'philadelphia-city-interactions-2026-09-11.mp4',folder/'philadelphia-run-check.mp4']
clips=[(0,0,11,'Huracan driving'),(1,0,9,'Detailed character walking'),
       (2,3,7,'Run start and stop'),(2,21,25,'Run in the actual city'),
       (1,16,27,'Mapped sidewalk damage'),(1,35,55,'Mapped small-structure removal')]
output=folder/'philadelphia-progress-preview.mp4'
filters=[]
for i,(source,start,end,label) in enumerate(clips):
    filters.append(f'[{source}:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,setsar=1[v{i}]')
filters.append(''.join(f'[v{i}]' for i in range(len(clips)))+f'concat=n={len(clips)}:v=1:a=0[out]')
command=[imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','warning','-y']
for source in inputs:command+=['-i',str(source)]
command+=['-filter_complex',';'.join(filters),'-map','[out]','-an','-c:v','libx264','-preset','fast',
          '-crf','20','-pix_fmt','yuv420p','-r','30','-movflags','+faststart',str(output)]
subprocess.run(command,check=True)
manifest={'output':str(output.relative_to(root)),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
          'durationSeconds':sum(end-start for _,start,end,_ in clips),'audio':False,
          'method':'Cuts from real gameplay captures, unchanged playback speed. No generated or interpolated frames.',
          'frameRateLimit':'30fps encoding repeats captured frames; actual game and capture cadence were uneven.',
          'clips':[{'source':str(inputs[source].relative_to(root)),'start':start,'end':end,'label':label} for source,start,end,label in clips]}
(folder/'progress-preview.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
