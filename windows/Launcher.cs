// Original VN Library desktop host. Built with Windows .NET Framework.
using System;
using System.IO;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Threading;
using Microsoft.Win32;

class Launcher : Form {
    readonly string app = AppDomain.CurrentDomain.BaseDirectory;
    readonly string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VN Import Toolkit");
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly Label status = new Label();
    readonly LinkLabel address = new LinkLabel();
    readonly NumericUpDown port = new NumericUpDown();
    readonly CheckBox login = new CheckBox();
    readonly Button start = new Button(), stop = new Button(), open = new Button(), apply = new Button();
    readonly NotifyIcon tray = new NotifyIcon();
    readonly object logLock = new object();
    Process server;
    int currentPort = 8891;
    bool quitting, closing, ready, openOnReady;
    string configPath { get { return Path.Combine(data, "desktop.json"); } }
    string url { get { return "http://127.0.0.1:" + currentPort + "/"; } }
    string python { get { return Path.Combine(app, "runtime", "python.exe"); } }
    static string Quote(string s) { return "\"" + s.Replace("\"", "\\\"") + "\""; }

    Launcher(bool hidden) {
        openOnReady=!hidden;
        Directory.CreateDirectory(data);
        string logPath=Path.Combine(data,"desktop.log");
        if(File.Exists(logPath) && new FileInfo(logPath).Length>2*1024*1024) {
            string previous=Path.Combine(data,"desktop.previous.log");
            if(File.Exists(previous)) File.Delete(previous); File.Move(logPath,previous);
        }
        Text = "VN Library"; Icon = SystemIcons.Application;
        Font = new Font("Segoe UI", 10); AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(490, 410); MinimumSize = new Size(510, 440);
        var layout = new FlowLayoutPanel { Dock=DockStyle.Fill, FlowDirection=FlowDirection.TopDown, WrapContents=false, Padding=new Padding(20), AutoScroll=true };
        Controls.Add(layout);
        layout.Controls.Add(new Label { Text="VN Library", Font=new Font(Font.FontFamily, 19), AutoSize=true, Margin=new Padding(0,0,0,12) });
        status.Text="Starting…"; status.Size=new Size(440, 55); layout.Controls.Add(status);
        address.Text=url; address.AutoSize=true; address.LinkClicked += (s,e)=>OpenReader(); layout.Controls.Add(address);
        var buttons=new FlowLayoutPanel { Width=440, Height=43, Margin=new Padding(0,12,0,0) };
        AddButton(buttons, start, "Start", StartServer); AddButton(buttons, open, "Open reader", OpenReader); AddButton(buttons, stop, "Stop", ()=>StopServer(false)); layout.Controls.Add(buttons);
        var settings=new FlowLayoutPanel { Width=440, Height=37 };
        settings.Controls.Add(new Label { Text="Port", AutoSize=true, Margin=new Padding(0,8,12,0) });
        port.Minimum=1; port.Maximum=65535; port.Value=8891; port.Width=90; settings.Controls.Add(port);
        AddButton(settings, apply, "Save port", SavePort); layout.Controls.Add(settings);
        login.Text="Start in the tray when I sign in"; login.AutoSize=true;
        using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")) login.Checked=key!=null && key.GetValue("VNImportToolkit")!=null;
        login.CheckedChanged+=(s,e)=>SetLogin(); layout.Controls.Add(login);
        var extras=new FlowLayoutPanel { Width=440, Height=40 };
        AddButton(extras,new Button(),"Open data folder",()=>Process.Start(new ProcessStartInfo(data){UseShellExecute=true}));
        AddButton(extras,new Button(),"Check tools",CheckTools); layout.Controls.Add(extras);
        layout.Controls.Add(new Label { Text="Closing this window keeps the reader in the tray.\nUse tray → Quit to stop it. Local access only.", AutoSize=true });
        var menu=new ContextMenuStrip();
        menu.Items.Add("Open reader",null,(s,e)=>OpenReader());
        menu.Items.Add("Settings",null,(s,e)=>ShowWindow());
        menu.Items.Add("Start",null,(s,e)=>StartServer());
        menu.Items.Add("Stop",null,(s,e)=>StopServer(false));
        menu.Items.Add(new ToolStripSeparator()); menu.Items.Add("Quit",null,(s,e)=>StopServer(true));
        tray.Icon=SystemIcons.Application; tray.Text="VN Library"; tray.ContextMenuStrip=menu; tray.Visible=true;
        tray.DoubleClick+=(s,e)=>ShowWindow();
        FormClosing+=(s,e)=>{ if(!closing) { e.Cancel=true; Hide(); } };
        FormClosed+=(s,e)=>tray.Dispose();
        Shown+=(s,e)=>{ if(hidden) Hide(); StartServer(); };
        try {
            if(File.Exists(configPath)) {
                var cfg=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(configPath));
                int value=Convert.ToInt32(cfg["port"]);
                if(value<1 || value>65535) throw new Exception("Port must be 1–65535");
                currentPort=value; port.Value=value;
            }
        } catch(Exception ex) { MessageBox.Show("Could not read desktop.json: "+ex.Message+"\nChoose and save a port in Settings."); }
        UpdateControls();
    }
    void AddButton(Control panel, Button button, string text, Action action) {
        button.Text=text; button.AutoSize=true; button.Height=30; button.Click+=(s,e)=>action(); panel.Controls.Add(button);
    }
    void UI(Action action) { if(!IsDisposed && IsHandleCreated) { try { BeginInvoke(action); } catch(InvalidOperationException) {} } }
    void Log(string text) {
        lock(logLock) {
            try { File.AppendAllText(Path.Combine(data,"desktop.log"),DateTime.Now.ToString("s")+" "+text+Environment.NewLine); } catch(IOException) {}
        }
    }
    void UpdateControls() {
        bool running=server!=null;
        start.Enabled=!running; stop.Enabled=running; open.Enabled=ready; address.Enabled=ready;
        port.Enabled=!running; apply.Enabled=!running; address.Text=url;
        tray.Text="VN Library — "+(ready?"Running":running?"Starting":"Stopped");
    }
    void ShowWindow() { Show(); WindowState=FormWindowState.Normal; Activate(); }
    void OpenReader() { if(ready) Process.Start(new ProcessStartInfo(url){UseShellExecute=true}); else ShowWindow(); }
    void SavePort() {
        if(server!=null) return;
        int selected=(int)port.Value;
        if(selected!=currentPort && MessageBox.Show("Changing the port changes the browser address. Export browser-local saves and activity from the old address first. Shared saves stay in the data folder.\n\nSave this port?","Change port",MessageBoxButtons.OKCancel)!=DialogResult.OK) return;
        try {
            string temporary=configPath+".tmp";
            File.WriteAllText(temporary,json.Serialize(new { version=1, port=selected }));
            if(File.Exists(configPath)) File.Replace(temporary,configPath,null); else File.Move(temporary,configPath);
            currentPort=selected; status.Text="Port saved. Click Start to use it."; UpdateControls();
        } catch(Exception ex) { MessageBox.Show("Could not save settings: "+ex.Message); }
    }
    void SetLogin() {
        try {
            using(var key=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")) {
                if(login.Checked) key.SetValue("VNImportToolkit", Quote(Application.ExecutablePath)+" --tray");
                else key.DeleteValue("VNImportToolkit",false);
            }
        } catch(Exception ex) { MessageBox.Show("Could not change start-at-login: "+ex.Message); }
    }
    ProcessStartInfo PythonInfo(string arguments) {
        var info=new ProcessStartInfo(python, "-X utf8 "+arguments) { WorkingDirectory=app, UseShellExecute=false, CreateNoWindow=true, RedirectStandardInput=true, RedirectStandardOutput=true, RedirectStandardError=true };
        info.EnvironmentVariables["PYTHONUTF8"]="1"; return info;
    }
    void StartServer() {
        if(server!=null) return;
        ready=false; quitting=false;
        try {
            var process=new Process();
            process.StartInfo=PythonInfo("-m vnkit.desktop_server --data "+Quote(data)+" --port "+currentPort);
            process.EnableRaisingEvents=true;
            process.OutputDataReceived+=(s,e)=>{
                if(e.Data==null) return;
                Log(e.Data);
                UI(()=>{
                    if(server!=process) return;
                    try {
                        var msg=json.Deserialize<Dictionary<string,object>>(e.Data);
                        string state=Convert.ToString(msg["status"]);
                        if(state=="running") { ready=true; status.Text="Running. You can close this window to keep it in the tray."; if(openOnReady) { openOnReady=false; OpenReader(); } }
                        if(state=="error") { status.Text=Convert.ToString(msg["message"]); quitting=false; ShowWindow(); }
                        UpdateControls();
                    } catch(Exception ex) { Log("Status message: "+ex.Message); }
                });
            };
            process.ErrorDataReceived+=(s,e)=>{ if(e.Data!=null) Log(e.Data); };
            process.Exited+=(s,e)=>UI(()=>{
                if(server!=process) return;
                int code=process.ExitCode; server=null; ready=false; process.Dispose();
                if(code==0) status.Text="Stopped. Games and server saves are kept.";
                else { status.Text="Could not run the reader. The port may be occupied. Check desktop.log in the data folder, or choose another port."; ShowWindow(); }
                UpdateControls(); if(quitting) Exit();
            });
            server=process; process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine();
            status.Text="Starting local reader…";
        } catch(Exception ex) { if(server!=null) server.Dispose(); server=null; status.Text="Could not start: "+ex.Message; ShowWindow(); }
        UpdateControls();
    }
    void StopServer(bool quit) {
        if(server==null) { if(quit) Exit(); return; }
        if(MessageBox.Show("Save your position in the browser first. Stop the local reader?","VN Library",MessageBoxButtons.OKCancel)!=DialogResult.OK) return;
        quitting=quit;
        try { server.StandardInput.WriteLine("{\"action\":\"stop\"}"); server.StandardInput.Flush(); status.Text="Stopping… (an active import must finish first)"; }
        catch(Exception ex) { quitting=false; status.Text="Could not stop: "+ex.Message; }
    }
    void CheckTools() {
        status.Text="Checking local import tools…";
        var worker=new Thread(()=>{
            try {
                using(var p=new Process()) {
                    p.StartInfo=PythonInfo("-m vnkit.windows_tools"); p.Start();
                    string output=p.StandardOutput.ReadToEnd(), error=p.StandardError.ReadToEnd(); p.WaitForExit();
                    bool success=p.ExitCode==0; string result=success?output:error; Log(result);
                    UI(()=>{ status.Text=success?"Import tools started successfully.":"Import tool check failed. See desktop.log."; MessageBox.Show(result,"Import tools"); });
                }
            } catch(Exception ex) { string message=ex.Message; UI(()=>MessageBox.Show(message,"Import tools")); }
        }); worker.IsBackground=true; worker.Start();
    }
    void Exit() { closing=true; tray.Visible=false; Close(); }
    [STAThread] static void Main(string[] args) {
        bool created;
        using(var mutex=new Mutex(true,@"Local\VNImportToolkit.Desktop",out created)) {
            if(!created) { MessageBox.Show("VN Library is already open. Look for it in the system tray."); return; }
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            try { Application.Run(new Launcher(Array.IndexOf(args,"--tray")>=0)); }
            catch(Exception ex) { MessageBox.Show(ex.ToString(),"VN Library"); }
        }
    }
}
