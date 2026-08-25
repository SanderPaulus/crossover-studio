import numpy as np, itertools
# Standaardwaarden (Jantzen / Audyn), inclusief series/parallel-combinaties van 2 delen
L_STD=[0.10,0.12,0.15,0.18,0.22,0.27,0.33,0.39,0.47,0.56,0.68,0.82,1.0,1.2,1.5,1.8,2.2,2.7,
       3.3,3.9,4.7,5.6,6.8,8.2,10.0,12.0,15.0]
C_STD=[0.47,0.68,1.0,1.5,2.2,3.3,4.7,5.6,6.8,8.2,10,12,15,18,22,27,33,39,47,56,68,82,100,
       120,150,180,200,220,250,270,300]
R_STD=[0.22,0.27,0.33,0.39,0.47,0.56,0.68,0.82,1.0,1.2,1.5,1.8,2.2,2.7,3.3,3.9,4.7,5.6,6.8,
       8.2,10,12,15,18,22,27,33,39,47]

def dcr_air14(L):        # Jantzen 14AWG air core, smooth fit
    return 0.255*L**0.55
def esr_cap(C):
    return max(0.006, 0.35/np.sqrt(C))

def cands_L(target,n=7):
    o=[(v,'%.2fmH'%v) for v in L_STD]
    for a,b in itertools.combinations(L_STD,2):
        if 0.4*target<a+b<2.5*target: o.append((a+b,'%.2f+%.2f'%(a,b)))
    o.sort(key=lambda t:abs(np.log(t[0]/target)))
    return o[:n]
def cands_C(target,n=7):
    o=[(v,'%guF'%v) for v in C_STD]
    for a,b in itertools.combinations(C_STD,2):
        if 0.4*target<a+b<2.5*target: o.append((a+b,'%g+%g'%(a,b)))
    o.sort(key=lambda t:abs(np.log(t[0]/target)))
    return o[:n]
def cands_R(target,n=7):
    o=[(v,'%gR'%v) for v in R_STD]
    for a,b in itertools.combinations_with_replacement(R_STD,2):
        s=a+b; p=a*b/(a+b)
        if 0.4*target<s<2.5*target: o.append((s,'%g+%g ser'%(a,b)))
        if 0.4*target<p<2.5*target: o.append((p,'%g||%g'%(a,b)))
    o.sort(key=lambda t:abs(np.log(t[0]/target)))
    return o[:n]

def parts(lab):
    lab=lab.replace('uF','').replace('mH','').replace('R','')
    if '||' in lab:
        a,b=[float(v) for v in lab.split('||')]; return [a*b/(a+b)]
    lab=lab.replace(' ser','')
    return [float(v) for v in lab.split('+')]
