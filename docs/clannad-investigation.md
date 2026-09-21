# CLANNAD PS2 investigation

Active target: `Clannad (Japan).iso`. Work on Pia Carrot is paused.

The supplied image is **CLANNAD, Japanese PlayStation 2 original standard
release SLPM-66302, executable version 1.01** (high confidence). `SYSTEM.CNF`
boots `SLPM_663.02` and records `VER = 1.01`, `VMODE = NTSC`. Its SHA-256 is
`35077758488971fc919b2afdadd4e9ebaad48ac67443cf281bbdbfed9bae81e9`.
The disc has an ISO9660 view with 2048-byte sectors and UDF bridge descriptors.
Identification and extraction never execute its ELF or IRX files.

The stripped MIPS executable contains the HuneX Consumer 3D System for
PlayStation2 identification and CLANNAD H3D source assertion paths. This is
**HuneX, not the PC RealLive engine**. Reusing a PC CLANNAD interpreter would not
execute these console scripts.

## Recovery and approach

- The complete disc was safely extracted with the existing ISO tool.
- ALLPAC.HED/NAM index 4,729 ALLPAC.MRG members. High address bits are a packed
  sector carry: the first 64K-sector wrap occurs at member 1,058. This was
  verified against contiguous extents and ELF function 0x1107a8.
- All 203 SEEN MZX scripts decompress and decode strictly as CP932. They contain
  original command instructions, not just strings: calls, labels, conditionals,
  assignments and `SEL` choice expressions. Static recovery is not execution.
- The executable's initial script literal is `seen0414.mzx`. Its source calls
  SEEN6900/Z00 for the prologue before returning. Do not sort/concatenate scenes.
- Native image sizes, tile grids, separate colour/mask data and lossless
  24-bit reconstruction have been recovered. Full-size backgrounds and example
  character body/expression images were personally inspected locally.
- BGM.AFS, VOICE/VOICE2 HED/NAM/MRG, VSE.AFS, SE banks and OPENING.PSS are on disc.
  All 42,958 voice clips, 53 BGM, 54 VSE and 23 SE.ACX clips converted successfully. The movie
  has verified decoded-video/PCM roundtrips; SE banks and full media command
  coverage remain incomplete. No missing copyrighted resources were fetched.

Existing research includes MIT-licensed **mangetsu** (MZX/MRG tools, not a full
interpreter) and MIT **PS2 Visual Novel Tool** (related HuneX formats). The
unlicensed psp-ayakashibito_tools repository was consulted for format notes;
its implementation is not incorporated. See provenance for source revisions.

Selected approach: retain the existing browser reader, storage, text publisher
and activity features, and implement a small edition-specific interpreter of
the recovered source commands. Media lookup and native behaviours belong in
the CLANNAD adapter. Unknown state/control commands must stop with source
locations; presentation approximations must be documented individually.

The private `resources-v2` extraction is the corrected one. The earlier
`private/clannad/extracted` probe had wrong offsets after the first sector wrap;
it is preserved as rejected evidence and must not supply artwork.

Actual browser execution now covers 2,450 consecutive text pages, both first-choice
branches and save/load. A separate headless control test reaches 2,487 segments; its
timing is simulated. Full routes and original PS2 comparison remain unverified.
See [runtime report](clannad-runtime.md) and [reproducible commands](clannad-import.md).
