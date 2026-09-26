"""VN Library media. Original MIT code; requires the separate AnkiConnect add-on."""
import threading
from aqt import mw, gui_hooks
from aqt.qt import QAction, QDialog, QDialogButtonBox, QFormLayout, QLineEdit, QVBoxLayout
from aqt.utils import showWarning, showInfo
from .bridge import BridgeServer, DEFAULTS, config_checked

server = None


def stop():
    global server
    if server:
        server.shutdown()
        server.server_close()
        server = None


def start(*args):
    global server
    if server:
        return
    try:
        config = {**DEFAULTS, **(mw.addonManager.getConfig(__name__) or {})}
        server = BridgeServer(config)
        threading.Thread(target=server.serve_forever, daemon=True, name='VN-Library-media').start()
    except Exception as e:
        server = None
        showWarning('VN Library media could not start: '+str(e))


def settings():
    c = {**DEFAULTS, **(mw.addonManager.getConfig(__name__) or {})}
    dialog = QDialog(mw)
    dialog.setWindowTitle('VN Library media')
    layout = QVBoxLayout(dialog)
    form = QFormLayout()
    inputs = {}
    for key, label in [('reader_origins','Reader addresses (comma separated)'),('port','Yomitan bridge port'),('anki_port','AnkiConnect port'),('source_field','Source URL field'),('image_field','Scene image field'),('audio_field','Sentence audio field')]:
        edit = QLineEdit(', '.join(c[key]) if isinstance(c[key], list) else str(c[key]))
        form.addRow(label, edit)
        inputs[key] = edit
    layout.addLayout(form)
    buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel)
    layout.addWidget(buttons)
    buttons.rejected.connect(dialog.reject)
    def save():
        try:
            data = {key: edit.text().strip() for key, edit in inputs.items()}
            data['reader_origins'] = [x.strip() for x in data['reader_origins'].split(',') if x.strip()]
            for key in ('port','anki_port'):
                data[key] = int(data[key])
            config_checked(data)
        except ValueError as e:
            showWarning(str(e), parent=dialog)
            return
        mw.addonManager.writeConfig(__name__, data)
        stop()
        start()
        dialog.accept()
        showInfo('In Yomitan, use http://127.0.0.1:'+str(data['port'])+' as the AnkiConnect address.\nMap '+data['source_field']+' to {url}. Leave '+data['image_field']+' and '+data['audio_field']+' blank.\nEnable Anki media in the VN Library reader.')
    buttons.accepted.connect(save)
    dialog.exec()


action = QAction('VN Library media…', mw)
action.triggered.connect(settings)
mw.form.menuTools.addAction(action)
mw.addonManager.setConfigAction(__name__, settings)
gui_hooks.profile_did_open.append(start)
gui_hooks.profile_will_close.append(stop)
