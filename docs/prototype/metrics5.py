import sys,numpy as np; sys.path.insert(0,'/home/claude/xo')
from adsio import read_lim, read_frd, interp_c
U='/mnt/user-data/uploads/'
dB=lambda x:20*np.log10(np.abs(x)+1e-30)

def lobing(fx, spacing_m):
    """4. hart-op-hart afstand uitgedrukt in golflengtes bij het kruispunt."""
    return spacing_m*fx/343.0

def epdr(Z):
    """5. Equivalent Peak Dissipation Resistance (Benjamin)."""
    ph=np.angle(Z)
    return np.abs(Z)/(2*np.cos(ph)**2)

def thevenin(net, ov, model, Zdrv):
    """2. Bronimpedantie die de driver ziet, via twee belastingen."""
    import copy
    Z1=Zdrv; Z2=2.0*Zdrv
    net.Zdrv[model]=Z1; _,V=net.solve(ov); V1=V[model]
    net.Zdrv[model]=Z2; _,V=net.solve(ov); V2=V[model]
    net.Zdrv[model]=Z1
    return (V2-V1)/(V1/Z1 - V2/Z2)

def lf_bump(F, Zdrv, Hel, NFcone):
    """1. Extra bult 40-110 Hz bovenop de kale kastafstemming."""
    i150=np.argmin(abs(F-150)); m=(F>40)&(F<110)
    nf=dB(NFcone)-dB(NFcone)[i150]
    bare=nf[m].max()
    s=nf+dB(Hel)-dB(Hel)[i150]
    return s[m].max()-bare, bare, F[m][np.argmax(s[m])]

def qts_mult(Rs_at_fs, Re):
    """2b. vermenigvuldiging van Qes door de bronweerstand."""
    return (Re+Rs_at_fs)/Re

def iec_weight(F):
    """IEC 60268-1 programmaruis: roze, 1e orde HP op 40 Hz en LP op 5 kHz."""
    hp=(F/40.0)**2/(1+(F/40.0)**2)
    lp=1.0/(1+(F/5000.0)**2)
    return hp*lp/F

def dissipation(F, Zin, Iabs, R, Eg=2.83, Pnom=100.0, weight=None):
    """3. vermogen in een weerstand, genormeerd op Pnom werkelijk in de luidspreker.
       Iabs = |I| in ampere bij bronspanning Eg (dus delen door Eg^2)."""
    Sv = iec_weight(F) if weight is None else weight(F)
    Pin=np.trapezoid(Sv*np.real(1.0/Zin),F)
    Sv=Sv*(Pnom/Pin)
    return np.trapezoid(Sv*(Iabs/Eg)**2*R, F)
