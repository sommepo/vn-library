#!/usr/bin/env python3
"""Generate the original MIT-licensed test fixture; never reads commercial data."""
import json
import math
from pathlib import Path
import struct
import wave

ROOT = Path(__file__).resolve().parent


def build():
    assets = {}
    scenes = {
        "dawn": ("#849ea5", "#dfb695", "#233c3e", "#466361"),
        "forest": ("#586c62", "#b6bc93", "#1c3933", "#36584a"),
        "shore": ("#759cba", "#ddd3b0", "#244b62", "#447f91"),
        "night": ("#131d36", "#3e4361", "#101b2a", "#223341"),
    }
    for name, (top, bottom, ridge, foreground) in scenes.items():
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient><linearGradient id="ground" x2="0" y2="1"><stop stop-color="{foreground}"/><stop offset="1" stop-color="{ridge}"/></linearGradient></defs><rect width="1280" height="800" fill="url(#sky)"/><circle cx="950" cy="160" r="62" fill="#f6e1b4" opacity=".65"/><path d="M0 430 130 350 245 395 460 220 655 355 800 285 1000 400 1130 300 1280 360V800H0Z" fill="{ridge}"/><path d="M0 500Q300 340 620 505T1280 420V800H0Z" fill="url(#ground)"/><path d="M360 800 650 468 703 472 740 800" fill="#c5bca0" opacity=".45"/><path d="M100 690V130M40 290 100 230 168 290M22 370 100 295 185 370M10 460 100 355 203 460" fill="none" stroke="{ridge}" stroke-width="24"/><path d="M1110 700V250M1038 415 1110 320 1188 415M1020 520 1110 400 1200 520" fill="none" stroke="{ridge}" stroke-width="20"/><g fill="#e5d9ba" opacity=".5"><circle cx="305" cy="575" r="2"/><circle cx="872" cy="517" r="3"/><circle cx="716" cy="570" r="2"/></g></svg>'''
        (ROOT / f"{name}.svg").write_text(svg)
        assets[name] = {"type": "image", "url": f"{name}.svg", "provenance": "Original geometric SVG, MIT"}
    (ROOT / "guide.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="320" height="620" viewBox="0 0 320 620"><path d="M55 620 80 300Q160 230 240 300L280 620" fill="#253d48"/><path d="M105 285 160 380 216 285 194 560 130 560Z" fill="#d3c7a9"/><path d="M142 345 176 345 184 470 156 505 132 470Z" fill="#786c73"/><ellipse cx="160" cy="178" rx="79" ry="103" fill="#d4b79e"/><path d="M80 210Q38 49 158 43 280 38 239 238L224 118 169 100 108 150 95 235Z" fill="#293138"/><path d="M81 146Q143 110 165 73L178 144 201 116 232 149" fill="#293138"/><path d="M123 183H138M181 183H196" stroke="#333841" stroke-width="5" stroke-linecap="round"/><path d="M144 232Q161 241 178 230" stroke="#8f6560" stroke-width="3" fill="none"/><path d="M78 312 33 512 69 530 111 379M242 312 290 512 253 530 211 379" fill="#344e58"/><path d="M65 530 49 561 78 568 90 538M258 530 275 563 244 570 230 538" fill="#d4b79e"/></svg>''')
    assets["guide"] = {"type": "image", "url": "guide.svg", "provenance": "Original geometric SVG figure, MIT"}
    for name, duration, frequencies in [("music", 8, (220, 277.18, 329.63)), ("chime", .5, (880, 1320)), ("voice-test", 1.2, (440, 550))]:
        with wave.open(str(ROOT / f"{name}.wav"), "wb") as output:
            rate = 16000
            output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            frames = bytearray()
            for n in range(int(rate * duration)):
                t = n / rate
                envelope = min(1, t * 10, (duration - t) * 10)
                value = sum(math.sin(2 * math.pi * frequency * t) for frequency in frequencies) / len(frequencies)
                frames.extend(struct.pack("<h", int(3000 * value * envelope)))
            output.writeframes(frames)
        assets[name] = {"type": "music" if name == "music" else "voice" if name == "voice-test" else "sound", "url": f"{name}.wav", "provenance": "Original generated sine tones, MIT; voice-test is a timing signal, not speech"}
    instructions = []

    def emit(id, op, **fields):
        instructions.append({"id": id, "op": op, **fields, "source": {"file": "original-synthetic", "instruction": len(instructions)}})

    emit("start", "background", asset="dawn")
    emit("music-start", "music", asset="music")
    emit("guide-on", "sprite", slot="guide", asset="guide", x=72, y=100, scale=.8, z=2)
    emit("counter-init", "set", name="pages", value=0)
    emit("opening", "text", speaker="案内人", text=["これは", {"base": "読書", "reading": "どくしょ"}, "機能を試すための、オリジナルの短い物語です。"], voice="voice-test")
    emit("sound-chime", "sound", asset="chime")
    emit("repeat-a", "text", text="風が、静かに吹いている。")
    emit("repeat-b", "text", text="風が、静かに吹いている。")
    emit("route-choice", "choice", options=[{"id": "forest", "text": [{"base": "森", "reading": "もり"}, "の道を歩く"], "target": "forest-set"}, {"id": "shore", "text": "海の道を歩く", "target": "shore-set"}])
    emit("forest-set", "set", name="route", value=1)
    emit("forest-bg", "background", asset="forest")
    emit("forest-text", "text", speaker="案内人", text="木々の間から、やわらかな光が差し込んでいる。")
    emit("forest-call", "call", target="memory")
    emit("forest-join", "jump", target="route-condition")
    emit("shore-set", "set", name="route", value=2)
    emit("shore-bg", "background", asset="shore")
    emit("shore-text", "text", speaker="案内人", text="波の音を聞きながら、砂浜に続く道を選んだ。")
    emit("shore-call", "call", target="memory")
    emit("shore-join", "jump", target="route-condition")
    emit("memory", "text", text="同じ言葉でも、違う場所で読むと、少し違って感じられる。", voice="voice-test")
    emit("memory-return", "return")
    emit("route-condition", "if", condition={"var": "route", "operator": "eq", "value": 1}, then="forest-result", **{"else": "shore-result"})
    emit("forest-result", "text", text="森を選んだことを、物語は覚えている。")
    emit("forest-result-join", "jump", target="common")
    emit("shore-result", "text", text="海を選んだことを、物語は覚えている。")
    emit("common", "text", speaker="案内人", text="ここからは、長く読み進める機能を確かめてみよう。")
    phrases = ["遠くで鳥が鳴いた。", "道の脇に、小さな花が咲いていた。", "立ち止まって、深く息を吸う。", "空の色が、少しずつ変わっていく。", "手帳を開いて、今日の言葉を書き留めた。", "知らない漢字を調べてから、もう一度読む。", "急がなくても、道は続いている。", "足元で、小石がころりと転がった。", "静かな時間が、ゆっくり流れた。", "次の曲がり角まで、一緒に歩こう。"]
    for n in range(1, 116):
        if n == 60:
            emit("evening-bg", "background", asset="night")
            emit("guide-off", "sprite", slot="guide", asset=None)
            emit("short-pause", "wait", ms=200)
        emit(f"count-{n:03}", "add", name="pages", value=1)
        emit(f"page-{n:03}", "text", text=f"記録{n}。{phrases[(n - 1) % len(phrases)]}")
    emit("finish-choice", "choice", options=[{"id": "again", "text": "同じ場所をもう一度読む", "target": "repeat-a"}, {"id": "finish", "text": "今日はここまで", "target": "closing", "condition": {"var": "pages", "operator": "gte", "value": 100}}])
    emit("closing", "text", speaker="案内人", text="お疲れさまでした。これは機能確認用の作品であり、読み込んだ市販ゲームではありません。")
    emit("music-stop", "music", asset=None)
    emit("end", "end")
    content = {"format": "vnkit.content", "version": 1, "id": "original-synthetic", "title": "小さな読書の道 · Original test fixture", "synthetic": True, "platform": {"id": "ps2", "name": "PlayStation 2"}, "adapter": {"id": "original-fixture", "version": "1.0.0"}, "entry": "start", "assets": assets, "instructions": instructions, "compatibility": {"status": "supported-fixture", "summary": "Original synthetic test only. No evidence of commercial game compatibility."}}
    (ROOT / "content.json").write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
