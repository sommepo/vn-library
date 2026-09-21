#!/usr/bin/env python3
"""Reproducible, private codec probe on outputs from remember11-ps2 recovery."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from vnkit.disc import write_json, write_bytes
p=argparse.ArgumentParser();p.add_argument('recovery',type=Path);p.add_argument('--out',required=True,type=Path)
p.add_argument('--vgmstream',type=Path,required=True);a=p.parse_args()
voice=a.recovery/'samples/raw/VOICE.AFS/00000-AV_CO_000.ADX'
bgm=a.recovery/'samples/decoded/BGM.AFS/00000-BGM01.BIP'
commands=[['ffprobe','-v','error','-show_entries','stream=codec_name,sample_rate,channels,duration','-of','json',str(voice)],
          [str(a.vgmstream),'-m',str(bgm)],['ffmpeg','-version']]
report={'scope':'two sampled resources; no voice association, BGM playback or story validation','commands':[]}
for command in commands:
 r=subprocess.run(command,capture_output=True,text=True,timeout=30)
 report['commands'].append({'command':command,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
with tempfile.TemporaryDirectory() as tmp:
 target=Path(tmp)/'voice.wav';cmd=['ffmpeg','-v','error','-i',str(voice),str(target)]
 r=subprocess.run(cmd,capture_output=True,text=True,timeout=30)
 report['commands'].append({'command':['ffmpeg','-v','error','-i',str(voice),'<temporary voice.wav>'],'exit':r.returncode,'stderr':r.stderr})
 if r.returncode==0:
  report['voice_output']=write_bytes(a.out,'sample-voice.wav',target.read_bytes());report['voice_output'].pop('status',None)
write_json(a.out,'media-probe.json',report)
print(json.dumps({'voice_decoded':'voice_output' in report,'bgm_decoder_exit':report['commands'][1]['exit'],'report':str(a.out/'media-probe.json')}))
sys.exit(0 if 'voice_output' in report else 2)
