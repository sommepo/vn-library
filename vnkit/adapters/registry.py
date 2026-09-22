"""One explicit registry for edition-specific adapters and GUI eligibility.

The registry deliberately records only exact editions. It is not an engine-family
catalogue and a record without ``gui_game_id`` remains unavailable from browser
import.
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


# Adding a game starts here after its proposal is agreed. A GUI game ID is an
# explicit playable-support decision; static recovery must leave it unset.
ADAPTERS = (
    AdapterSpec(
        'clannad-ps2', 'vnkit.adapters.clannad_ps2',
        importer_module='vnkit.adapters.clannad_import',
        gui_game_id='clannad-slpm66302-1.01',
        validation_notice_prefixes=('CLANNAD import is incomplete:',),
        preflight_profile='clannad',
        setup_guide='clannad-import.md',
    ),
    AdapterSpec('pia-ps2', 'vnkit.adapters.pia_ps2'),
    AdapterSpec(
        'remember11-ps2', 'vnkit.adapters.remember11_ps2',
        importer_module='vnkit.adapters.remember11_import',
        gui_game_id='remember11-slpm65550-1.02',
        validation_notice_prefixes=('Remember11 basic runtime remains incomplete:',),
        preflight_profile='remember11',
        setup_guide='remember11-import.md',
    ),
)


def adapter_ids() -> tuple[str, ...]:
    return tuple(spec.adapter_id for spec in ADAPTERS)


def adapter_spec(adapter_id: str) -> AdapterSpec | None:
    return next((spec for spec in ADAPTERS if spec.adapter_id == adapter_id), None)


def gui_adapter(adapter_id: str) -> AdapterSpec | None:
    spec = adapter_spec(adapter_id)
    return spec if spec and spec.gui_playable else None
