#!/usr/bin/env python3
"""
nf_merge_reference.py — referentiegetallen voor NF/FF-merge v2 (Crossover Studio)

Reproduceert de analyse van 12/13-11-2026 op de casus-1-bestanden in test-fixtures/
(de FRD's in casus1/ en koan_2026-09_testkast/, de ruwe .pir's in casus1_pir/).
Bedoeld als ONAFHANKELIJKE controle (V15: een niet-reproduceerbare waarde is geen
referentie maar een herinnering). De TypeScript-implementatie moet deze getallen
binnen de tolerantie van het overdrachtsdocument halen.

Gebruik:  python3 -I tools/nf_merge_reference.py [repo-root]
Vereist:  numpy, scipy  (pip install numpy scipy)

Secties:
  A  reproductie van de huidige nf-merge/1.0 (vrije faseverschuiving, ongelijk gegate)
  B  zelfde fit met de faseverschuiving vast op 0
  C  'matched gate' op de I-2-combinatie (september-NF op augustus-FF): blijft
     onverklaard — oorzaak is de sessiemix, niet het venster of een reflectie
  D  zelfde sessie: augustus-NF en -FF uit de ruwe .pir's (gedeelde tijdbasis),
     gelijk gegate, offset vast, overname boven de fitband zoals nf-merge/2.0.
     Dit is de onafhankelijke controle op src/lib/nfMergeV2.ts.
  E  poortweging: Helmholtz-controle en effect van de diameter
"""
import sys, os
import numpy as np
from scipy.special import j1

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
TF = os.path.join(ROOT, 'test-fixtures')
W = os.path.join(TF, 'koan_2026-09_testkast')
C = os.path.join(TF, 'casus1')
C0 = 343.0

# ---------------------------------------------------------------- I/O
def frd(path):
    F, S, P = [], [], []
    for line in open(path, encoding='latin1'):
        s = line.strip()
        if not s or s[0] in '*F#':
            continue
        v = s.split()
        try:
            F.append(float(v[0])); S.append(float(v[1])); P.append(float(v[2]))
        except (ValueError, IndexError):
            pass
    return np.array(F), np.array(S), np.array(P)

# ---------------------------------------------------------------- shelf (app-model)
_FL = np.fft.rfftfreq(2**20, 1 / 96000); _FL[0] = 1e-3
def _minphase_deg(db):
    """Echte minimumfase via reëel cepstrum op een dicht lineair raster."""
    M = 2**20
    lm = db / 20 * np.log(10)
    full = np.concatenate([lm, lm[-2:0:-1]])
    c = np.fft.ifft(full).real
    w = np.zeros_like(c); w[0] = 1; w[1:M // 2] = 2; w[M // 2] = 1
    return np.degrees(np.fft.fft(c * w)[:M // 2 + 1].imag)
def app_shelf_db_deg(fc=440.0, depth=6.0):
    db = -depth / (1 + _FL / fc)          # baffleStepShelfDb: eerste orde in dB
    return db, _minphase_deg(db)
SH_DB, SH_PH = app_shelf_db_deg()

# ================================================================ A + B
def _onto(f, s, p, g):
    up = np.unwrap(np.radians(p))
    lf, lg = np.log(f), np.log(np.clip(g, f[0], f[-1]))
    return np.interp(lg, lf, s), np.degrees(np.interp(lg, lf, up))

def unmatched(farp, nearp, portp, wport, band):
    gf, gs, gp = frd(farp)
    ns, nph = _onto(*frd(nearp), gf)
    pn = 10**(ns / 20) * np.exp(1j * np.radians(nph))
    if portp:
        ps, pp = _onto(*frd(portp), gf)
        pn = pn + wport * 10**(ps / 20) * np.exp(1j * np.radians(pp))
    nd = 20 * np.log10(abs(pn)) + np.interp(gf, _FL, SH_DB)
    nph = np.degrees(np.angle(pn)) + np.interp(gf, _FL, SH_PH)
    m = (gf >= band[0]) & (gf <= band[1]); idx = np.where(m)[0]
    lvl = np.median(gs[m] - nd[m])
    d, prev = [], 0.0
    for k, i in enumerate(idx):
        x = gp[i] - nph[i]
        if k == 0:
            x = ((x + 180) % 360) - 180
        else:
            while x - prev > 180: x -= 360
            while x - prev < -180: x += 360
        d.append(x); prev = x
    d = np.array(d); f = gf[idx]
    b, a = np.polyfit(f, d, 1)
    res_free = np.sqrt(np.mean((d - (a + b * f))**2))
    best = None
    for tgt in (0, 180):
        for k in range(-30, 31):
            y = d - (tgt + 360 * k)
            bb = np.sum(f * y) / np.sum(f * f)
            r = np.sqrt(np.mean((y - bb * f)**2))
            if best is None or r < best[0]:
                best = (r, bb, tgt + 360 * k, tgt)
    r_fix, bb, A, tgt = best
    shift = {q: (a + b * q) - (A + bb * q) for q in (362, 519)}
    return dict(gain=lvl, delay_ms=-b / 360 * 1e3, offset=((a + 180) % 360) - 180,
                res_free=res_free, res_fixed=r_fix, fixed_to=tgt, shift=shift)

# ================================================================ C + D
FS, N = 48000, 32768
DF = FS / N
FG = np.arange(N // 2 + 1) * DF

def on_grid(path):
    f, s, p = frd(path)
    z = 10**(s / 20) * np.exp(1j * np.radians(p))
    out = np.zeros(N // 2 + 1, complex)
    k = np.rint(f / DF).astype(int)
    ok = (k >= 0) & (k <= N // 2) & (abs(k * DF - f) < 0.01)
    out[k[ok]] = z[ok]
    return out, k[ok].min(), k[ok].max()

def ff_window(ref=2.5, right=5.021, alpha=0.25, left=0.0):
    """ARTA-venster uit de header, in de tijd t.o.v. de referentie (zoals de FRD-fase)."""
    T = N / FS * 1e3
    t = np.arange(N) / FS * 1e3
    t = np.where(t > T / 2, t - T, t)
    g = right - ref
    w = np.zeros(N); w[(t >= left - ref) & (t <= g)] = 1
    ts = g * (1 - alpha); m = (t > ts) & (t <= g)
    w[m] = 0.5 * (1 + np.cos(np.pi * (t[m] - ts) / (g - ts)))
    return w
WIN = ff_window()

def arta_shelf(f0):
    x = FG / f0
    return (1 + 1j * x) / (2 + 1j * x)

def raised_cos(f, a, b):
    x = np.clip(np.log(np.maximum(f, 1e-3) / a) / np.log(b / a), 0, 1)
    return 0.5 - 0.5 * np.cos(np.pi * x)

def matched_fit(farp, nearp, portp, wport, band, tau0, model, xf=(650, 900)):
    """Fit alleen versterking + looptijd (faseverschuiving vast 0) op gelijk gegate signalen."""
    FF, k0, k1 = on_grid(farp)
    NF, _, _ = on_grid(nearp)
    if portp:
        P, _, _ = on_grid(portp); NF = NF + wport * P
    pred = NF * model
    valid = np.zeros(N // 2 + 1, bool); valid[k0:k1 + 1] = True
    c = raised_cos(FG, *xf)   # boven xf: gemeten FF, eronder: voorspelling
    B = np.fft.rfft(WIN * np.fft.irfft(np.where(valid, c * FF, 0), N))
    m = (FG >= band[0]) & (FG <= band[1])
    def ev(tau):
        lo = np.where(valid, (1 - c) * pred * np.exp(-2j * np.pi * FG * tau), 0)
        A = np.fft.rfft(WIN * np.fft.irfft(lo, N))
        G = np.real(np.sum(np.conj(A[m]) * (FF[m] - B[m]))) / np.sum(abs(A[m])**2)
        if G <= 0:
            return (1e9, 0.0, tau)
        e = FF[m] / (G * A[m] + B[m])
        return (np.sqrt(np.mean(np.degrees(np.angle(e))**2)),
                np.sqrt(np.mean((20 * np.log10(abs(e)))**2)), tau)
    best = min(ev(t) for t in np.arange(tau0 - 8e-4, tau0 + 8e-4, 1e-5))
    best = min(ev(t) for t in np.arange(best[2] - 1e-5, best[2] + 1e-5, 1e-6))
    return best

SD_WO24 = 255e-4                       # m², datasheet per woofer
A_PISTON = np.sqrt(SD_WO24 / np.pi)
# ================================================================ D
def _pir(path):
    b = open(path, 'rb').read()
    if b[:4] != b'PIR\x00':
        raise ValueError(f'{path}: geen ARTA PIR')
    info = int.from_bytes(b[8:12], 'little')
    fs = int(np.frombuffer(b[24:28], '<i4')[0]); n = int(np.frombuffer(b[28:32], '<i4')[0])
    mtype = int(np.frombuffer(b[40:44], '<i4')[0])          # 2 = dual-channel: gedeelde tijdbasis
    return fs, mtype, np.frombuffer(b[80 + info:80 + info + 4 * n], '<f4').astype(float)

def same_session(pdir, name, f0, band, wport=0.0):
    """nf-merge/2.0 in numpy: venster over de voorspelling, versterking + looptijd vrij,
    offset vast, boven fitHi·2^(1/6..2/3) neemt het gemeten vervelveld het over
    (anders lekt het verschil NF≠FF boven ka≈1 via het 2,5-ms-venster de fitband in)."""
    fs, mt, ff = _pir(os.path.join(pdir, name + '_hor_0.pir'))
    _, mtn, nf = _pir(os.path.join(pdir, name + '_near.pir'))
    if wport:
        nf = nf + wport * _pir(os.path.join(pdir, 'poort_near.pir'))[2]
    N = len(ff); f = np.fft.rfftfreq(N, 1 / fs)
    ref = np.argmax(np.abs(ff)) / fs - 0.4e-3               # referentie 0,4 ms vóór de piek
    t = np.arange(N) / fs - ref; t = np.where(t > N / fs / 2, t - N / fs, t)
    Wd = np.zeros(N); Wd[(t >= -2.5e-3) & (t <= 2.521e-3)] = 1
    ts = 2.521e-3 * 0.75; m_ = (t > ts) & (t <= 2.521e-3)
    Wd[m_] = 0.5 * (1 + np.cos(np.pi * (t[m_] - ts) / (2.521e-3 - ts)))
    x = f / f0; P = np.fft.rfft(nf) * (1 + 1j * x) / (2 + 1j * x)
    Fr = np.fft.rfft(ff); Fg = np.fft.rfft(Wd * ff)
    h0, h1 = band[1] * 2 ** (1 / 6), band[1] * 2 ** (2 / 3)
    c = np.clip(np.log(np.maximum(f, 1e-9) / h0) / np.log(h1 / h0), 0, 1); c = 0.5 - 0.5 * np.cos(np.pi * c)
    B = np.fft.rfft(Wd * np.fft.irfft(c * Fr, N))
    k = (f >= band[0]) & (f <= band[1])
    def ev(tau):
        A = np.fft.rfft(Wd * np.fft.irfft((1 - c) * P * np.exp(-2j * np.pi * f * tau), N))
        g = np.real(np.sum(np.conj(A[k]) * (Fg[k] - B[k]))) / np.sum(abs(A[k]) ** 2)
        e = Fg[k] / (g * A[k] + B[k])
        return (np.sqrt(np.mean(np.degrees(np.angle(e)) ** 2)), np.sqrt(np.mean((20 * np.log10(abs(e))) ** 2)), tau, g)
    best = min((ev(q) for q in np.arange(2.0e-3, 4.0e-3, 2e-5)), key=lambda r: r[0])
    best = min((ev(q) for q in np.arange(best[2] - 2e-5, best[2] + 2e-5, 2.5e-7)), key=lambda r: r[0])
    return best, (mt, mtn)

# ================================================================ run
def main():
    wup = (os.path.join(C, 'woofer_up_hor_0.txt'), os.path.join(W, 'woofer_up_near.txt'))
    wdn = (os.path.join(C, 'woofer_down_hor_0.txt'), os.path.join(W, 'woofer_down_near.txt'))
    port = os.path.join(W, 'port_near.txt')
    mid = (os.path.join(C, 'mid_hor_0.txt'), os.path.join(C, 'mid_near.txt'))

    print('A/B  ongelijk gegate, app-shelf 440 Hz (reproductie nf-merge/1.0, daarna offset vast)')
    for name, (fp, npth), pp, wp, band in [('woofer boven', wup, port, 0.205, (400, 550)),
                                           ('woofer onder', wdn, port, 0.205, (400, 550)),
                                           ('mid', mid, None, 0.0, (500, 800))]:
        r = unmatched(fp, npth, pp, wp, band)
        print(f"  {name:13s} band {band}: gain {r['gain']:+.2f} dB, delay {r['delay_ms']:+.4f} ms, "
              f"offset {r['offset']:+.1f}°, resid {r['res_free']:.1f}°  |  offset vast {r['fixed_to']}: "
              f"resid {r['res_fixed']:.1f}°, faseverschil vrij−vast @362 {r['shift'][362]:+.1f}° @519 {r['shift'][519]:+.1f}°")

    print('\nC    I-2-combinatie (september-NF + poort op augustus-FF), matched gate, offset 0, AN4 f0 150 Hz, 300–576 Hz')
    base = arta_shelf(150)
    for name, (fp, npth), t0 in [('woofer onder', wdn, -5.30e-3), ('woofer boven', wup, -5.69e-3)]:
        r = matched_fit(fp, npth, port, 0.205, (300, 576), t0, base)
        print(f"  {name:13s}: {r[0]:.1f}° / {r[1]:.2f} dB rms, delay {r[2]*1e3:+.4f} ms")

    print('\nD    zelfde sessie (augustus, ruwe .pir), gelijk gegate, offset vast, overname zoals nf-merge/2.0')
    pdir = os.path.join(TF, 'casus1_pir')
    for name, f0, band, wp in [('woofer_down', 150, (300, 576), 0.0), ('woofer_down', 150, (300, 576), 0.205),
                               ('woofer_up', 150, (300, 576), 0.0), ('woofer_up', 150, (300, 576), 0.205),
                               ('mid', 200, (300, 800), 0.0)]:
        (deg, db, tau, g), mts = same_session(pdir, name, f0, band, wp)
        print(f"  {name:12s} poort {wp:.3f}: τ {tau*1e3:.3f} ms, {deg:.1f}° / {db:.2f} dB, polariteit {'0' if g > 0 else '180'}°, PIR-type {mts}")

    print('\nE    poort')
    for S in (43e-4, 110e-4):
        fb = C0 / (2 * np.pi) * np.sqrt(S / (0.0532 * 0.6))
        print(f"  rechte buis {S*1e4:.0f} cm², 600 mm, 53,2 L: fb ≈ {fb:.1f} Hz (zonder eindcorrectie); gemeten 29,7–31,3 Hz")
    gf, _, _ = frd(wup[0])
    for wn in ('woofer_up_near.txt', 'woofer_down_near.txt'):
        cs, cp = _onto(*frd(os.path.join(W, wn)), gf)
        ps, pp = _onto(*frd(port), gf)
        pc = 10**(cs / 20) * np.exp(1j * np.radians(cp)); po = 10**(ps / 20) * np.exp(1j * np.radians(pp))
        a_ = 20 * np.log10(abs(pc + 0.205 * po)); b_ = 20 * np.log10(abs(pc + 0.328 * po))
        m = (gf >= 400) & (gf <= 550); off = np.median(b_[m] - a_[m])
        pts = ', '.join(f"{q} Hz {b_[np.argmin(abs(gf-q))] - a_[np.argmin(abs(gf-q))] - off:+.1f} dB" for q in (30, 40, 50, 100))
        print(f"  {wn}: gewicht 0,205 → 0,328 (Ø74 → Ø118 mm): {pts}")

if __name__ == '__main__':
    main()
