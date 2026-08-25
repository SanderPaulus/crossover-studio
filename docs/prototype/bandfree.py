"""Bandloze impedantie-classificatie (vervangt de banded aanpak; zie V8).
Motionele pieken herkend aan fasenuldoorgang; reflex = 2 motionele pieken + diepe dip."""
import numpy as np
def classify(f, z):
    a=np.abs(z); Re0=float(np.median(z.real[:max(3,len(f)//40)]))
    pk=[i for i in range(2,len(f)-2)
        if a[i]>a[i-1] and a[i]>=a[i+1] and a[i]>1.6*Re0
        and a[i]>=a[max(0,i-8):i+8].max()*0.999]
    mot=[i for i in pk if abs(np.angle(z[i],deg=True))<25]
    if len(mot)>=2:
        dip=min(range(mot[0],mot[1]),key=lambda j:a[j])
        if a[dip]<0.6*min(a[mot[0]],a[mot[1]]):
            return dict(type='reflex',Re0=Re0,fL=f[mot[0]],fb=f[dip],fH=f[mot[1]],
                        Zdip=a[dip],check_sqrt=float(np.sqrt(f[mot[0]]*f[mot[1]])))
    if mot:
        i=mot[0]; return dict(type='gesloten',Re0=Re0,fc=f[i],Zmax=a[i],r0=a[i]/Re0)
    return dict(type='onbekend',Re0=Re0)
# Bekende beperking V8d: Re0 overschat als de meting dicht op fL begint -> motionele fit nodig.
