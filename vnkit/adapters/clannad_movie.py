"""Reuse the validated Sony PSS/PCM path for CLANNAD's matching movie format."""
import argparse
import subprocess
from pathlib import Path
from vnkit.disc import write_json
# This helper was first implemented for Pia; the full PSS/SShd format checks
# also match CLANNAD. No old game's assets, paths or mappings are reused.
from .pia_movie import convert_movie,verify_movie


def convert(source,output):
    report=convert_movie(Path(source),Path(output))
    check=verify_movie(Path(source),Path(output)/report['movie'])
    result={**report,'format':'vnkit.clannad-movie','roundtrip':check}
    write_json(Path(output),'movie.json',result)
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    try:
        result=convert(a.source,a.out);print(result['movie'],result['movie_sha256'])
    except (ValueError,OSError,subprocess.SubprocessError) as error:p.exit(2,str(error)+'\n')
