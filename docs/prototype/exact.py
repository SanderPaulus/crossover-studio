import sys,pickle,re,numpy as np; sys.path.insert(0,'/home/claude/xo')
import cat_ as K
from refine import COIL

def dcr1(pid,L): return COIL[pid]*L**0.55
def esr1(C):     return max(0.006,0.35/np.sqrt(C))

def parse(pid,kind,label):
    """Exacte waarde + parasiet uit het samenstellingslabel."""
    if kind=='L':
        parts=[float(x) for x in re.findall(r'[\d.]+',label)]
        L=sum(parts); return L, sum(dcr1(pid,p) for p in parts)
    if kind=='C':
        parts=[float(x) for x in re.findall(r'[\d.]+',label)]
        C=sum(parts); e=[esr1(p) for p in parts]
        return C, 1.0/sum(1.0/x for x in e)
    parts=[float(x) for x in re.findall(r'[\d.]+',label)]
    if '||' in label: R=parts[0]*parts[1]/(parts[0]+parts[1])
    else: R=sum(parts)
    return R, None

def build_ov(lab):
    ov={}
    for (pid,kind),l in lab.items():
        v,par=parse(pid,kind,l); ov[(pid,kind)]=v
        if kind=='L': ov[(pid,'DCR')]=par
        if kind=='C': ov[(pid,'ESR')]=par
    return ov
