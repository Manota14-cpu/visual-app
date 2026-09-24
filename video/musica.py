"""
La banda sonora del video, sintetizada nota por nota.

    python3 musica.py            deja musica.wav al lado (48 kHz, estéreo)

No usa ningún sample ni pista de otro: el bombo, los platillos, el bajo, los
acordes, el pitido del lector y el "ding" del cobro salen de fórmulas, así que
el video se puede publicar sin preguntarle nada a nadie.

Va a 120 pulsos por minuto —un compás cada dos segundos— y los cortes del
video caen en esos pulsos. Los efectos están en los segundos exactos en que
pasan las cosas en pantalla (ver los tiempos en escenas.js).

Necesita numpy y scipy.
"""

import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
DURACION = 45.0
COLA = 1.5
N = int((DURACION + COLA) * SR)
rng = np.random.default_rng(14)

# Tres buses: lo seco, lo que va a la reverberación y los efectos de la
# interfaz, que van más adelante y con menos reverberación.
seco = np.zeros((2, N))
envio = np.zeros((2, N))


def muestras(seg):
    return int(round(seg * SR))


def tiempo(n):
    return np.arange(n) / SR


def filtro(x, tipo, corte, orden=2):
    sos = butter(orden, corte, btype=tipo, fs=SR, output="sos")
    return sosfilt(sos, x, axis=-1)


def envolvente(n, ataque, caida, sosten=0.0, suelta=None):
    """Una envolvente de ataque lineal y caída exponencial."""
    t = tiempo(n)
    e = np.minimum(1.0, t / max(ataque, 1e-4))
    decae = np.exp(-np.maximum(0, t - ataque) / max(caida, 1e-4))
    e = e * (sosten + (1 - sosten) * decae)
    if suelta:
        r = muestras(suelta)
        if r < n:
            e[-r:] *= np.linspace(1, 0, r) ** 2
    return e


def pon(bus, inicio, senal, gan=1.0, paneo=0.0):
    """Suma una señal mono (o estéreo) al bus, con paneo de potencia constante."""
    i = muestras(inicio)
    if i >= N:
        return
    if senal.ndim == 1:
        a = (paneo + 1) * np.pi / 4
        senal = np.stack([senal * np.cos(a), senal * np.sin(a)]) * np.sqrt(2)
    fin = min(N, i + senal.shape[1])
    bus[:, i:fin] += gan * senal[:, : fin - i]


def hz(nota):
    """'A4' → 440. Sostenidos con #."""
    nombres = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    letra, octava = nota[:-1], int(nota[-1])
    return 440.0 * 2 ** ((nombres[letra] + (octava - 4) * 12) / 12)


# ─────────────────────────────  Instrumentos  ─────────────────────────────

def bombo(gan=1.0):
    n = muestras(0.45)
    t = tiempo(n)
    f = 45 + 110 * np.exp(-t / 0.035)
    fase = 2 * np.pi * np.cumsum(f) / SR
    cuerpo = np.sin(fase) * envolvente(n, 0.001, 0.22)
    golpe = filtro(rng.standard_normal(n), "highpass", 1800) * envolvente(n, 0.0005, 0.006) * 0.35
    return (cuerpo + golpe) * gan


def estruendo(dur=2.5):
    """El golpe grave de los cortes grandes: un seno que cae de tono."""
    n = muestras(dur)
    t = tiempo(n)
    f = 32 + 70 * np.exp(-t / 0.18)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * envolvente(n, 0.002, 0.7)
    ruido = filtro(rng.standard_normal(n), "lowpass", 900) * envolvente(n, 0.001, 0.12) * 0.5
    return np.tanh(1.6 * (s + ruido)) * 0.9


def platillo(abierto=False):
    n = muestras(0.35 if abierto else 0.08)
    ruido = filtro(rng.standard_normal(n), "highpass", 7500, 4)
    return ruido * envolvente(n, 0.0008, 0.11 if abierto else 0.018) * 0.5


def palmas():
    n = muestras(0.4)
    ruido = filtro(rng.standard_normal(n), "bandpass", [900, 3200], 2)
    e = np.zeros(n)
    for d in (0.0, 0.011, 0.022):
        i = muestras(d)
        e[i:] += envolvente(n - i, 0.0005, 0.012 if d < 0.02 else 0.13)
    return ruido * e * 0.55


def bajo(f, dur):
    n = muestras(dur)
    t = tiempo(n)
    diente = 2 * ((t * f) % 1) - 1
    cuadrada = np.sign(np.sin(2 * np.pi * f * t)) * 0.4
    s = filtro(diente + cuadrada, "lowpass", 420, 4) + 0.6 * np.sin(2 * np.pi * f * t)
    return s * envolvente(n, 0.004, dur * 0.55, 0.0, 0.02) * 0.5


def colchon(frecuencias, dur, brillo=1400):
    """Acordes de sierras desafinadas apenas, como un sintetizador analógico."""
    n = muestras(dur)
    t = tiempo(n)
    izq, der = np.zeros(n), np.zeros(n)
    for f in frecuencias:
        for v, d in enumerate((-0.11, -0.04, 0.0, 0.05, 0.12)):
            ff = f * 2 ** (d / 12)
            fase = rng.random()
            s = 2 * ((t * ff + fase) % 1) - 1
            if v % 2:
                izq += s
            else:
                der += s
    e = envolvente(n, min(0.6, dur * 0.3), 99, 1.0, min(0.8, dur * 0.4))
    izq = filtro(izq, "lowpass", brillo, 2) * e
    der = filtro(der, "lowpass", brillo, 2) * e
    return np.stack([izq, der]) * (0.06 / max(1, len(frecuencias) ** 0.5))


def punteo(f, dur=0.35):
    n = muestras(dur)
    t = tiempo(n)
    mod = np.sin(2 * np.pi * f * 2 * t) * 1.2 * np.exp(-t / 0.05)
    s = np.sin(2 * np.pi * f * t + mod) * envolvente(n, 0.002, 0.09)
    return s * 0.22


def campana(f, dur=2.0, gan=0.3):
    """Una campana de FM: parciales que no son armónicos, como el metal."""
    n = muestras(dur)
    t = tiempo(n)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t / 0.4)
    s = np.sin(2 * np.pi * f * t + mod) * envolvente(n, 0.001, dur * 0.3)
    s += 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * envolvente(n, 0.001, dur * 0.1)
    return s * gan


def pitido(f=2750, dur=0.085):
    """El lector de códigos del mostrador."""
    n = muestras(dur)
    t = tiempo(n)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 2 * t)
    e = np.minimum(1, t / 0.002) * np.minimum(1, (dur - t) / 0.006)
    return s * e * 0.2


def clic(gan=1.0, agudo=5200):
    n = muestras(0.03)
    ruido = filtro(rng.standard_normal(n), "bandpass", [agudo * 0.5, agudo], 2)
    tono = np.sin(2 * np.pi * 1900 * tiempo(n)) * 0.4
    return (ruido + tono) * envolvente(n, 0.0003, 0.006) * 0.9 * gan


def tecla():
    return clic(0.55, 7000)


def burbuja(f=880, gan=0.18):
    """El 'pop' de algo que aparece: un seno que sube rápido."""
    n = muestras(0.12)
    t = tiempo(n)
    ff = f * (0.7 + 0.5 * (1 - np.exp(-t / 0.02)))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * envolvente(n, 0.002, 0.03) * gan


def soplido(dur, sube=True, gan=0.35, desde=300, hasta=6000):
    """Ruido que barre un filtro: la ráfaga de las transiciones."""
    n = muestras(dur)
    ruido = rng.standard_normal(n)
    trozos = 48
    salida = np.zeros(n)
    largo = n // trozos + 1
    for k in range(trozos):
        a, b = k * largo, min(n, (k + 1) * largo + 256)
        if a >= n:
            break
        p = k / (trozos - 1)
        p = p if sube else 1 - p
        c = desde * (hasta / desde) ** p
        trozo = filtro(ruido[a:b], "bandpass", [c * 0.6, min(c * 1.6, SR / 2 - 100)], 2)
        ventana = np.hanning(b - a)
        salida[a:b] += trozo * ventana
    forma = np.sin(np.pi * np.linspace(0, 1, n)) ** (1.5 if sube else 0.8)
    if sube:
        forma = np.linspace(0, 1, n) ** 2.2
    return salida * forma * gan


def subida(dur, gan=0.3):
    """El ascenso antes del final: ruido que se abre y un tono que trepa."""
    n = muestras(dur)
    t = tiempo(n)
    f = 110 * 2 ** (3 * t / dur)
    tono = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3
    return (soplido(dur, True, 1.0, 400, 9000) + tono) * (t / dur) ** 2 * gan


# ─────────────────────────────────  Música  ─────────────────────────────────

ACORDES = {
    "Am9": (["A2"], ["A3", "C4", "E4", "G4", "B4"]),
    "F": (["F1"], ["F3", "A3", "C4", "E4"]),
    "G": (["G1"], ["G3", "B3", "D4", "E4"]),
    "Am": (["A1"], ["A3", "C4", "E4", "G4"]),
    "C": (["C2"], ["G3", "C4", "E4", "B4"]),
    "Gsus": (["G1"], ["G3", "C4", "D4", "F4"]),
    "Cmaj9": (["C2"], ["E3", "G3", "B3", "D4", "E4"]),
}

# (inicio, duración, acorde)
PROGRESION = [(0, 4, "Am9"), (4, 1, "F"), (5, 1, "G"), (6, 1, "Am"), (7, 1, "C")]
PROGRESION += [(8 + 2 * i, 2, ["F", "G", "Am", "C"][i % 4]) for i in range(14)]
PROGRESION += [(36, 2, "F"), (38, 1.5, "Gsus"), (39.5, 1.5, "G"), (41, 4.5, "Cmaj9")]

PULSO = 0.5
bombos = []

for inicio, dur, nombre in PROGRESION:
    graves, notas = ACORDES[nombre]
    frecuencias = [hz(x) for x in notas]
    # El colchón se abre en el tramo más movido y se cierra al principio.
    brillo = 900 if inicio < 4 else 1300 if inicio < 27 else 2000 if inicio < 36 else 1600
    if inicio >= 41:
        brillo = 2400
    c = colchon(frecuencias, dur + 0.6, brillo)
    pon(seco, inicio, c, 0.8)
    pon(envio, inicio, c, 0.6)

    # Los golpes de las palabras: Stock, Caja, Ventas, Todo.
    if 4 <= inicio < 8:
        pon(seco, inicio, bombo(1.1))
        pon(seco, inicio, bajo(hz(graves[0]) * 2, 0.9), 0.9)
        for f in frecuencias:
            pon(envio, inicio, punteo(f * 2, 0.6), 0.5, rng.uniform(-0.6, 0.6))
        bombos.append(inicio)

    # El ritmo, del Panel hasta el celular.
    if 8 <= inicio < 36:
        pasos = int(dur / PULSO)
        for p in range(pasos):
            t0 = inicio + p * PULSO
            pon(seco, t0, bombo(0.95))
            bombos.append(t0)
            pon(seco, t0 + PULSO / 2, platillo(inicio >= 27 and p % 2 == 1), 0.8, 0.3)
            if inicio >= 27:
                pon(seco, t0 + PULSO / 4, platillo(), 0.35, -0.3)
                pon(seco, t0 + 3 * PULSO / 4, platillo(), 0.35, -0.3)
            if p % 2 == 1 and inicio >= 14:
                pon(seco, t0, palmas(), 0.8)
                pon(envio, t0, palmas(), 0.35)
            # Bajo en corcheas, con la octava de arriba en la segunda.
            f = hz(graves[0]) * 2
            pon(seco, t0, bajo(f, 0.24), 0.95)
            pon(seco, t0 + PULSO / 2, bajo(f * (2 if p % 2 else 1), 0.22), 0.8)
        # Arpegio en semicorcheas por las notas del acorde, en dos octavas.
        if inicio >= 8:
            escala = sorted(frecuencias) + [f * 2 for f in sorted(frecuencias)]
            dibujo = [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 4, 3, 1]
            for k in range(int(dur / 0.125)):
                f = escala[dibujo[k % 16] % len(escala)]
                gan = 0.55 if inicio < 27 else 0.75
                paneo = 0.45 * np.sin(k * 0.9)
                pon(seco, inicio + k * 0.125, punteo(f * 2), gan * 0.6, paneo)
                pon(envio, inicio + k * 0.125, punteo(f * 2), gan * 0.5, paneo)

    # La subida del final: bombo en negras y un redoble que se acelera.
    if 36 <= inicio < 41:
        pasos = int(dur / PULSO)
        for p in range(pasos):
            t0 = inicio + p * PULSO
            pon(seco, t0, bombo(0.8))
            bombos.append(t0)
            pon(seco, t0, bajo(hz(graves[0]) * 2, 0.4), 0.8)

# Redoble de palmas cada vez más apretado antes del cierre.
t = 39.0
paso = 0.25
while t < 40.95:
    pon(seco, t, palmas(), 0.25 + 0.5 * (t - 39) / 2)
    t += paso
    paso = max(0.0625, paso * 0.86)
pon(seco, 38.5, subida(2.5), 0.9)

# El pulso de la música se hunde un poco con cada bombo: el bombeo de siempre.
bombeo = np.ones(N)
for b in bombos:
    i = muestras(b)
    largo = min(N - i, muestras(0.3))
    if largo > 0:
        bombeo[i : i + largo] = np.minimum(bombeo[i : i + largo], 1 - 0.45 * np.exp(-tiempo(largo) / 0.09))
seco *= bombeo
envio *= bombeo

# ─────────────────────────────  Los momentos  ─────────────────────────────

# La marca aparece sobre negro.
pon(seco, 0.2, estruendo(3.0), 0.8)
pon(envio, 0.2, campana(hz("E5"), 3.0, 0.12), 1.0, -0.3)
pon(envio, 0.9, campana(hz("B5"), 3.0, 0.1), 1.0, 0.3)
for k, n in enumerate(["E6", "A6", "B6", "E7"]):
    pon(envio, 1.4 + k * 0.07, campana(hz(n), 1.5, 0.06), 1.0, -0.4 + k * 0.25)
pon(seco, 3.2, subida(0.8, 0.5))
pon(seco, 4.0, estruendo(1.2), 0.7)

# Las transiciones.
for t0, dur in [(7.55, 0.6), (9.05, 0.6), (13.4, 0.7), (21.4, 0.65), (26.5, 0.6), (32.45, 0.65), (36.45, 0.7), (40.5, 0.6)]:
    pon(seco, t0, soplido(dur, True, 0.22), 1.0, 0.2)
    pon(envio, t0, soplido(dur, True, 0.1), 1.0, -0.2)

# El Panel: tarjetas que aparecen, contadores y el globo del gráfico.
for i in range(4):
    pon(seco, 9.45 + i * 0.09, burbuja(660 + i * 110, 0.1), 1.0, -0.3 + i * 0.2)
for i in range(4):
    pon(seco, 10.3 + i * 0.08, burbuja(990 + i * 90, 0.08), 1.0, 0.3 - i * 0.2)
pon(seco, 11.25, burbuja(1320, 0.12), 1.0, 0.4)

# La caja. Los tiempos son los de escenas.js (14 + T.*).
pon(seco, 14.85, pitido())
pon(seco, 15.35, tecla(), 1.0, 0.1)
pon(seco, 15.43, tecla(), 1.0, 0.1)
pon(seco, 15.51, tecla(), 1.0, 0.1)
pon(seco, 15.95, clic(0.8), 1.0, 0.1)
for k in range(3):
    pon(seco, 16.35 + k * 0.07, tecla(), 1.0, -0.1)
pon(seco, 16.95, pitido())
pon(seco, 17.75, clic(1.0), 1.0, -0.2)
pon(seco, 18.25, clic(1.0), 1.0, 0.3)
pon(seco, 18.3, soplido(0.35, True, 0.12), 1.0)
pon(seco, 18.9, clic(0.9), 1.0, -0.1)
for k in range(5):
    pon(seco, 19.0 + k * 0.06, tecla(), 1.0, -0.1)
pon(seco, 19.75, clic(1.0), 1.0, 0.2)
# El "ding" del cobro: dos campanas en quinta.
pon(seco, 19.98, campana(hz("E6"), 1.6, 0.26), 1.0, -0.15)
pon(seco, 20.06, campana(hz("B6"), 1.6, 0.2), 1.0, 0.15)
pon(envio, 19.98, campana(hz("E6"), 1.6, 0.12), 1.0)
pon(seco, 20.45, soplido(0.5, False, 0.14), 1.0)

# Productos: tildes, el botón y los rodillos.
for t0 in (23.05, 23.4, 23.75):
    pon(seco, t0, clic(0.9), 1.0, -0.3)
    pon(seco, t0 + 0.02, burbuja(1200, 0.06), 1.0, -0.3)
pon(seco, 24.3, clic(1.0), 1.0, 0.2)
for k in range(16):
    pon(seco, 24.45 + k * 0.05 * (1 + k * 0.06), clic(0.35, 9000), 1.0, 0.4 * np.sin(k))
for i in range(3):
    pon(seco, 24.75 + i * 0.05, burbuja(1500 + i * 150, 0.07), 1.0, 0.3)
pon(seco, 25.2, burbuja(700, 0.12), 1.0, 0.2)
pon(seco, 25.45, burbuja(620, 0.1), 1.0, 0.2)

# Las teselas.
for i in range(8):
    pon(seco, 27.2 + i * 0.09, burbuja(520 + (i % 4) * 130, 0.07), 1.0, -0.5 if i % 2 == 0 else 0.5)

# Informes: el selector de período.
pon(seco, 33.65, clic(0.8), 1.0, 0.1)
pon(seco, 33.7, burbuja(900, 0.07))

# El celular: el lector de la cámara y las pastillas.
pon(seco, 39.2, pitido(2900, 0.07))
for i in range(3):
    pon(seco, 39.35 + i * 0.13, burbuja(780 + i * 120, 0.08), 1.0, -0.4 + i * 0.4)

# El cierre.
pon(seco, 41.0, estruendo(3.5), 1.0)
pon(seco, 41.0, bombo(1.2))
for k, n in enumerate(["C6", "E6", "G6", "B6", "D7"]):
    pon(envio, 42.0 + k * 0.06, campana(hz(n), 2.5, 0.07), 1.0, -0.5 + k * 0.25)

# ─────────────────────────────  Mezcla final  ─────────────────────────────

def reverberacion(duracion=2.4):
    n = muestras(duracion)
    t = tiempo(n)
    ir = np.stack([rng.standard_normal(n), rng.standard_normal(n)]) * np.exp(-t / (duracion / 6.9))
    ir = filtro(ir, "lowpass", 6000)
    ir[:, : muestras(0.02)] = 0
    return ir / np.sqrt(np.sum(ir**2, axis=1, keepdims=True))


ir = reverberacion()
humedo = np.stack([fftconvolve(envio[c], ir[c])[:N] for c in range(2)])
mezcla = seco + humedo * 0.55

# Lo grave se centra y lo que retumba por debajo de 30 Hz se va.
mezcla = filtro(mezcla, "highpass", 28)
graves = filtro(mezcla, "lowpass", 140)
centro = graves.mean(axis=0, keepdims=True)
mezcla = mezcla - graves + centro

# Fundido de salida y un limitador suave.
fin = muestras(DURACION)
mezcla[:, fin - muestras(0.6) : fin] *= np.linspace(1, 0, muestras(0.6)) ** 1.5
mezcla[:, fin:] = 0
mezcla = mezcla[:, :fin]
mezcla /= np.max(np.abs(mezcla)) + 1e-9
mezcla = np.tanh(mezcla * 1.6) / np.tanh(1.6)
mezcla *= 10 ** (-1.0 / 20)

salida = Path(__file__).with_name("musica.wav")
with wave.open(str(salida), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mezcla.T * 32767).astype("<i2").tobytes())

rms = 20 * np.log10(np.sqrt(np.mean(mezcla**2)) + 1e-9)
print(f"{salida} · {mezcla.shape[1] / SR:.2f} s · {rms:.1f} dBFS RMS")
