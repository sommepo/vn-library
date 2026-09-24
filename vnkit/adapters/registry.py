"""One explicit registry for edition-specific adapters and GUI eligibility.

The registry deliberately records only exact editions.  It is not an engine
family catalogue and a record without ``gui_game_id`` remains unavailable from
the browser import flow.
"""
from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module


@dataclass(frozen=True)
class AdapterSpec:
    """Registration metadata that is safe to expose without game content."""

    adapter_id: str
    module: str
    importer_module: str | None = None
    gui_game_id: str | None = None
    validation_notice_prefixes: tuple[str, ...] = ()
    preflight_profile: str | None = None
    setup_guide: str | None = None
    edition_label: str | None = None
    max_unsupported_sites: int | None = None

    @property
    def gui_playable(self) -> bool:
        return self.gui_game_id is not None

    def load(self):
        return import_module(self.module)

    def import_game(self, source, output, work=None):
        """Call the edition's importer without giving generic code VM semantics."""
        if self.importer_module:
            return import_module(self.importer_module).import_game(source, output, work)
        return self.load().import_game(source, output)


# Adding a game starts here after its proposal is agreed.  A GUI game ID is an
# explicit playable-support decision; static recovery must leave it unset.
ADAPTERS = (
    AdapterSpec(
        'cartagra-ps2', 'vnkit.adapters.cartagra_ps2',
        importer_module='vnkit.adapters.cartagra_import',
        gui_game_id='cartagra-slpm66231-1.01',
        validation_notice_prefixes=('Cartagra native presentation remains incomplete:',),
        preflight_profile='clannad',
        setup_guide='cartagra-runtime.md',
        edition_label='PS2 Cartagra SLPM-66231 v1.01',
        # One specifically identified framebuffer-capture site stays fail-closed.
        # The validator rejects any other unsupported story site, even one site.
        max_unsupported_sites=1,
    ),
    AdapterSpec(
        'ever17-ps2', 'vnkit.adapters.ever17_ps2',
        importer_module='vnkit.adapters.ever17_import',
        gui_game_id='ever17-slpm65421-1.01',
        validation_notice_prefixes=('Ever17 native presentation remains incomplete:',),
        preflight_profile='sony-banks',
        setup_guide='ever17-runtime.md',
        edition_label='PS2 Ever17 Premium Edition SLPM-65421 v1.01',
        max_unsupported_sites=0,
    ),
    AdapterSpec(
        'clannad-ps2', 'vnkit.adapters.clannad_ps2',
        importer_module='vnkit.adapters.clannad_import',
        gui_game_id='clannad-slpm66302-1.01',
        validation_notice_prefixes=('CLANNAD import is incomplete:',),
        preflight_profile='clannad',
        setup_guide='clannad-import.md',
        edition_label='PS2 CLANNAD SLPM-66302 v1.01',
    ),
    AdapterSpec(
        'pia-ps2', 'vnkit.adapters.pia_ps2',
    ),
    AdapterSpec(
        'remember11-ps2', 'vnkit.adapters.remember11_ps2',
        importer_module='vnkit.adapters.remember11_import',
        gui_game_id='remember11-slpm65550-1.02',
        validation_notice_prefixes=('Remember11 basic runtime remains incomplete:',),
        preflight_profile='sony-banks',
        setup_guide='remember11-import.md',
        edition_label='PS2 Remember11 SLPM-65550 v1.02',
    ),
    AdapterSpec(
        'higurashi-matsuri-ps2', 'vnkit.adapters.higurashi_ps2',
        importer_module='vnkit.adapters.higurashi_import',
        gui_game_id='higurashi-slpm66913-1.01',
        validation_notice_prefixes=('Higurashi native presentation remains incomplete:',),
        preflight_profile='clannad',
        setup_guide='higurashi-runtime.md',
        edition_label='PS2 Higurashi Matsuri Kakera Asobi SLPM-66913 v1.01',
        max_unsupported_sites=0,
    ),
    AdapterSpec(
        'never7-ps2', 'vnkit.adapters.never7_ps2',
        importer_module='vnkit.adapters.never7_import',
        gui_game_id='never7-slps25256-1.01',
        validation_notice_prefixes=('Never7 experimental runtime remains incomplete:',),
        preflight_profile='sony-banks',
        setup_guide='never7-runtime.md',
        edition_label='PS2 Never7 SLPS-25256 v1.01',
        max_unsupported_sites=0,
    ),
)


def adapter_ids() -> tuple[str, ...]:
    return tuple(spec.adapter_id for spec in ADAPTERS)


def adapter_spec(adapter_id: str) -> AdapterSpec | None:
    return next((spec for spec in ADAPTERS if spec.adapter_id == adapter_id), None)


def gui_adapter(adapter_id: str) -> AdapterSpec | None:
    spec = adapter_spec(adapter_id)
    return spec if spec and spec.gui_playable else None
