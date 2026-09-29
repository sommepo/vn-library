# Memories Off PS1 engine fingerprint

Confirmed edition: original Japanese PlayStation SLPS-02296, volume MEMOFF.
Executable SHA-256:
`70e95cbbd8af166c8f004501ea2d99928fc62dc4f331ede3cd622d408b342efa`.
Font SHA-256:
`4fa89f1cb59686302f68ef3f750877217c24a5b92f86537f0cfb5527d4a5f5c5`.
The executable is inspected as data only. No game code or installer is executed.

## Confirmed native consumers

- `8001a810`: decimal MMSSFF plus sector-count resource strings, not one integer.
- `80026904`: 4 KiB ring LZSS, write cursor FEE, LSB-first literal flags and
  overlapping references. The header is compressed length including its four
  bytes, unlike Remember11's output-length convention.
- `80024ba0`, `80024c38`: scenario table and script loading.
- `8001c5a8`: byte-opcode dispatcher; original offsets remain stable reader IDs.
- `80023184`: backgrounds below 100 use one table; IDs >=100 use a separate CG
  table. Treating all IDs as one contiguous table yields wrong artwork.
- `80023580`: two portrait slots, native positioning/crop metadata. The 512×240
  source coordinate plane displays at 4:3. Tall CGs retain 480 source rows.
- `8001bd6c`, specifically `8001bddc`: portrait upload clears the final palette
  entry at byte offsets 212/213. **Index 255** becomes transparent; index zero
  contains an ordinary colour. The decoder follows this source operation.
- `80024fd8`: voice ID selects XA group `id / 32`, channel `id % 32`. The supplied
  audio sectors are Form 2, mono 18,900 Hz, four-bit XA. Form 2 is never truncated
  into an ISO Form 1 view.
- `8001c104`: LCG, signed division then unsigned remainder for the bounded
  random operation; its inclusive upper bound is the source argument plus one.
- `80049df4`: source JIS font-index mapping, including the compact kanji range.

The resource layer distinguishes sector/form validation from unperformed EDC/ECC
verification. TIM crop files can retain a full-width declared block size; actual
decoded byte extent and dimensions are checked independently. Source image
pixels retain their dimensions; the existing reader compositor handles display.

## Comparison and upstream checks

CLANNAD's HuneX HED/MRG/MZX and command model do not match this bytecode.
Remember11/Ever17 MAC containers and Never7's PS2 MWo3/oscr word commands also
differ. KID attribution and common LZSS/Sony assets do not establish VM
compatibility. This adapter therefore has independent branch/state semantics;
only proven generic IO, PNG, rendering and reader controls are shared.

The upstream [PS2 Visual Novel Tool](https://github.com/punk7890/PS2-Visual-Novel-Tool)
lists later PS2 Memories Off games, which is not evidence for this PS1 edition.
The [MAGES compendium](https://github.com/CommitteeOfZero/compendium) does not
provide an exact parser for these resources. No matching game-script parser
was established and no upstream script implementation was copied.

[VGMTrans PS1 support](https://github.com/vgmtrans/vgmtrans/tree/3e16daae49d42246f2d1b302b04f6e80a8037342/src/main/formats/PS1)
is used externally for standard Sony music, with its zlib licence retained.
The local short-VAB adjustment addresses a documented scanner limit rather than
changing the game's sample. This is standard asset reuse, not shared script VM
support. See [runtime tests and measured limits](memoriesoff-runtime.md).
