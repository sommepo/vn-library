"""VN Library media. Original MIT code; requires the separate AnkiConnect add-on."""
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import threading
from aqt import mw, gui_hooks
from aqt.qt import QAction, QCheckBox, QDialog, QDialogButtonBox, QFormLayout, QHBoxLayout, QLabel, QLineEdit, QPushButton, QVBoxLayout
from aqt.utils import askUser, showWarning, showInfo
from .bridge import BridgeServer, DEFAULTS, config_checked, tailscale_origin, tailscale_serve_command

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
    remote = QCheckBox('Allow mining from my phone / another device through Tailscale')
    remote.setChecked(c['remote_enabled'])
    layout.addWidget(remote)
    remote_form = QFormLayout()
    for key, label in [('remote_origin','This Anki computer’s HTTPS address'),('remote_key','Phone connection key'),('anki_key','Existing AnkiConnect key (usually blank)')]:
        edit = QLineEdit(c[key])
        if key.endswith('_key'):
            edit.setEchoMode(QLineEdit.EchoMode.Password)
        remote_form.addRow(label, edit)
        inputs[key] = edit
    inputs['remote_origin'].setPlaceholderText('https://your-anki-computer.your-tailnet.ts.net:8776')
    layout.addLayout(remote_form)
    help_text = QLabel('The game may stay on your home server. This Anki computer must stay awake.\n'
        'Save these settings before using the phone. Remote mode requires the connection key\n'
        'in Yomitan on both the phone and this computer. AnkiConnect stays on loopback.')
    help_text.setWordWrap(True)
    layout.addWidget(help_text)
    row = QHBoxLayout()
    layout.addLayout(row)
    def add_button(text, callback):
        control = QPushButton(text)
        control.clicked.connect(callback)
        row.addWidget(control)
        return control
    def values():
        data = {key: edit.text().strip() for key, edit in inputs.items()}
        data['reader_origins'] = [x.strip() for x in data['reader_origins'].split(',') if x.strip()]
        for key in ('port','anki_port'):
            data[key] = int(data[key])
        data['remote_enabled'] = remote.isChecked()
        return config_checked(data)
    def generate():
        if inputs['remote_key'].text() and not askUser('Replace the connection key? Update it in Yomitan on every connected device after saving.', parent=dialog):
            return
        inputs['remote_key'].setText(secrets.token_urlsafe(32))
    def enable(checked):
        for key in ('remote_origin','remote_key','anki_key'):
            inputs[key].setEnabled(checked)
        if checked and not inputs['remote_key'].text():
            inputs['remote_key'].setText(secrets.token_urlsafe(32))
    remote.toggled.connect(enable)
    enable(remote.isChecked())
    def detect_work():
        exe = shutil.which('tailscale')
        if not exe and os.name == 'nt':
            candidate = Path(os.environ.get('ProgramFiles', r'C:\Program Files'))/'Tailscale/tailscale.exe'
            if candidate.is_file():
                exe = str(candidate)
        if not exe:
            raise ValueError('Install and connect Tailscale on this computer first')
        result = subprocess.run([exe, 'status', '--json'], capture_output=True, text=True,
            timeout=8, check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        return json.loads(result.stdout)
    def detected(future):
        try:
            if not dialog.isVisible():
                return
            detect_button.setEnabled(True)
        except RuntimeError:
            return  # The settings window may have closed while detection ran.
        try:
            inputs['remote_origin'].setText(tailscale_origin(future.result(), int(inputs['port'].text())))
            remote.setChecked(True)
        except Exception:
            showWarning('Could not detect this computer’s Tailscale address. Connect Tailscale, or enter its full HTTPS address manually.', parent=dialog)
    def detect():
        detect_button.setEnabled(False)
        mw.taskman.run_in_background(detect_work, detected)
    detect_button = add_button('Detect Tailscale', detect)
    add_button('New key', generate)
    def copy_value(key):
        value = inputs[key].text().strip()
        if value:
            mw.app.clipboard().setText(value)
    add_button('Copy phone address', lambda: copy_value('remote_origin'))
    add_button('Copy key', lambda: copy_value('remote_key'))
    def commands():
        try:
            command = tailscale_serve_command(values())
        except ValueError as e:
            showWarning(str(e), parent=dialog)
            return
        mw.app.clipboard().setText(command)
        showInfo('The setup command is copied. Save these settings, then on this Anki computer:\n\n'
            '1. Run: tailscale serve status\n'
            '2. Check the chosen HTTPS port is unused (or already points to this bridge).\n'
            '3. Run the copied command:\n'+command+'\n\n'
            'If the port belongs to another service, choose an unused HTTPS port in the address.\n'
            'Use Serve, not Funnel. Do not reset your other Tailscale routes.\n'
            'On the phone, use the HTTPS address and connection key in Yomitan.\n'
            'Keep AnkiConnect’s own bind address and port unchanged.', parent=dialog)
    command_button = QPushButton('Copy Tailscale setup command / instructions')
    command_button.clicked.connect(commands)
    layout.addWidget(command_button)
    buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel)
    layout.addWidget(buttons)
    buttons.rejected.connect(dialog.reject)
    def save():
        try:
            data = values()
        except ValueError as e:
            showWarning(str(e), parent=dialog)
            return
        mw.addonManager.writeConfig(__name__, data)
        stop()
        start()
        if server is None:
            return
        dialog.accept()
        connection = ('Phone: '+data['remote_origin']+'\nUse the connection key in Yomitan’s API key setting on all devices.\n'
                      if data['remote_enabled'] else '')
        showInfo(connection+'On this computer: http://127.0.0.1:'+str(data['port'])+'\nMap '+data['source_field']+' to {url}. Leave '+data['image_field']+' and '+data['audio_field']+' blank.\nEnable Anki media separately in each reading browser.')
    buttons.accepted.connect(save)
    dialog.exec()


action = QAction('VN Library media…', mw)
action.triggered.connect(settings)
mw.form.menuTools.addAction(action)
mw.addonManager.setConfigAction(__name__, settings)
gui_hooks.profile_did_open.append(start)
gui_hooks.profile_will_close.append(stop)
