"""Локальный синтез речи вашим голосом (F5-TTS Russian) для Telegram-ассистентов.

Что делает:
  1) грузит модель на видеокарту и держит её в памяти;
  2) сам подключается к слушателю по WebSocket (wss://…/tts-connect) и озвучивает фразы,
     которые тот присылает (ответ — OGG/Opus). ПК выключен — слушатель шлёт текстом.

Запуск: voice\\.venv\\Scripts\\python voice\\tts_server.py   (или voice\\start.vbs — без окна)
Нужно рядом: models\\model_v2.safetensors, models\\vocab.txt, ref\\ref.ogg (образец голоса 8–15 с),
ca-bundle.pem (сертификаты Windows), а в ..\\cf_api.txt — TTS_KEY.
"""
import io
import json
import os
import re
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
# ffmpeg лежит в .venv\Scripts (из imageio-ffmpeg) — pydub ищет его в PATH; сертификаты Windows — для Hugging Face
os.environ['PATH'] = str(HERE / '.venv' / 'Scripts') + os.pathsep + os.environ.get('PATH', '')
os.environ.setdefault('SSL_CERT_FILE', str(HERE / 'ca-bundle.pem'))
os.environ.setdefault('REQUESTS_CA_BUNDLE', str(HERE / 'ca-bundle.pem'))
WORKER = 'https://shopping-listener.lev-3d7.workers.dev'
MODEL = HERE / 'models' / 'model_v2.safetensors'
VOCAB = HERE / 'models' / 'vocab.txt'
REF_AUDIO = HERE / 'ref' / 'ref.ogg'
REF_TEXT = HERE / 'ref' / 'ref.txt'
LOG = HERE / 'tts.log'


def log(*parts):
    line = time.strftime('%Y-%m-%d %H:%M:%S ') + ' '.join(str(p) for p in parts)
    print(line, flush=True)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def keys():
    kv = {}
    for line in open(ROOT / 'cf_api.txt', encoding='utf-8-sig'):
        if '=' in line:
            k, v = line.strip().split('=', 1)
            kv[k.strip()] = v.strip()
    return kv


KV = keys()
TTS_KEY = KV['TTS_KEY']

# ---------- модель ----------
import soundfile as sf  # noqa: E402
from f5_tts.api import F5TTS  # noqa: E402
from ruaccent import RUAccent  # noqa: E402

# образец из Telegram — OGG/Opus; F5 читает его через pydub, которому для OGG нужен ffprobe.
# WAV pydub читает сам — переводим один раз.
REF_WAV = HERE / 'ref' / 'ref.wav'
if not REF_WAV.exists() or REF_WAV.stat().st_mtime < REF_AUDIO.stat().st_mtime:
    data, rate = sf.read(str(REF_AUDIO))
    sf.write(str(REF_WAV), data, rate, subtype='PCM_16')

log('загружаю модель…')
tts = F5TTS(model='F5TTS_v1_Base', ckpt_file=str(MODEL), vocab_file=str(VOCAB), device='cuda')
accent = RUAccent()
accent.load(omograph_model_size='turbo', use_dictionary=True)
if REF_TEXT.exists():
    ref_text = REF_TEXT.read_text(encoding='utf-8').strip()
else:
    # один раз: модель сама распознаёт образец (Whisper), результат сохраняем
    ref_text = tts.transcribe(str(REF_WAV), language='ru').strip()
    REF_TEXT.write_text(ref_text, encoding='utf-8')
    log('образец распознан:', ref_text)


def stress(text):
    """Ударения RUAccent. Его модель омографов падает на некоторых словах («двоих») —
    тогда по словам, а сломанное слово оставляем без ударения."""
    try:
        return accent.process_all(text)
    except Exception:  # noqa: BLE001
        out = []
        for word in text.split(' '):
            try:
                out.append(accent.process_all(word))
            except Exception:  # noqa: BLE001
                out.append(word)
        return ' '.join(out)


ref_text_acc = stress(ref_text)
gpu = threading.Lock()
log('модель готова')

URL_RE = re.compile(r'https?://\S+')
EMOJI_RE = re.compile('[\U0001F000-\U0001FAFF☀-➿️‍]')


def clean(text):
    text = URL_RE.sub('', text)
    text = EMOJI_RE.sub('', text)
    text = text.replace('«', '').replace('»', '').replace('—', ',')
    return re.sub(r'\s+', ' ', text).strip()


def synth(text):
    gen = stress(clean(text))
    with gpu:
        wav, sr, _ = tts.infer(ref_file=str(REF_WAV), ref_text=ref_text_acc, gen_text=gen,
                               nfe_step=16, speed=1.0, remove_silence=False, show_info=lambda *a: None)
    buf = io.BytesIO()
    sf.write(buf, wav, sr, format='OGG', subtype='OPUS')
    return buf.getvalue()


# ---------- подключение к слушателю ----------
# Входящий туннель до ПК провайдер режет, поэтому ПК сам держит WebSocket к слушателю
# (wss://…/tts-connect, хаб TtsHub) и получает по нему фразы: {"id", "text"} → {"id", "audio"}.
import asyncio  # noqa: E402
import base64  # noqa: E402
import ssl  # noqa: E402

import websockets  # noqa: E402

WS_URL = WORKER.replace('https://', 'wss://') + '/tts-connect'
SSL_CTX = ssl.create_default_context(cafile=str(HERE / 'ca-bundle.pem'))


async def handle(ws, raw):
    job = json.loads(raw)
    started = time.time()
    try:
        audio = await asyncio.to_thread(synth, str(job.get('text', ''))[:600])
        await ws.send(json.dumps({'id': job['id'], 'audio': base64.b64encode(audio).decode()}))
        log(f'синтез {time.time() - started:.1f} с, {len(audio) // 1024} КБ:', job.get('text', '')[:80])
    except Exception as err:  # noqa: BLE001
        log('ошибка синтеза:', err)
        await ws.send(json.dumps({'id': job.get('id'), 'error': str(err)[:200]}))


async def keepalive(ws):
    while True:
        await asyncio.sleep(30)
        await ws.send('ping')  # хаб отвечает «pong», не просыпаясь


async def serve():
    delay = 5
    while True:
        try:
            async with websockets.connect(WS_URL, additional_headers={'X-Key': TTS_KEY}, ssl=SSL_CTX,
                                          ping_interval=None, max_size=None, open_timeout=30) as ws:
                log('подключён к слушателю')
                delay = 5
                pinger = asyncio.create_task(keepalive(ws))
                try:
                    async for raw in ws:
                        if raw != 'pong':
                            asyncio.create_task(handle(ws, raw))
                finally:
                    pinger.cancel()
            log('соединение закрыто')
        except Exception as err:  # noqa: BLE001
            log('нет связи со слушателем:', err)
        await asyncio.sleep(delay)
        delay = min(delay * 2, 120)


if __name__ == '__main__':
    if '--test' in sys.argv:
        out = HERE / 'test.ogg'
        out.write_bytes(synth(' '.join(a for a in sys.argv[1:] if a != '--test') or 'Принял. Разобрал на три задачи.'))
        log('тест записан:', out)
        sys.exit(0)
    asyncio.run(serve())
