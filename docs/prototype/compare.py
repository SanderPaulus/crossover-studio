import sys,pickle,numpy as np; sys.path.insert(0,'/home/claude/xo')
from adsio import read_lim, read_frd, interp_c
from setup import DRV
from fastnet import FastNet
import variants as VV
from exact import build_ov
from metrics5 import *
U='/mnt/user-data/uploads/'
F=np.logspace(np.log10(20),np.log10(20000),1600)
FB=np.logspace(np.log10(20),np.log10(20000),1200)
def iz(m):
    z=DRV[m]['Z'](FB); return np.interp(np.log(F),np.log(FB),z.real)+1j*np.interp(np.log(F),np.log(FB),z.imag)
ZD={m:iz(m) for m in DRV}
DL={m:{'Z':(lambda f,m=m: ZD[m]),'P':None} for m in DRV}
nu=read_frd(U+'woofer_up_near.txt'); nd=read_frd(U+'woofer_down_near.txt')
NFc=interp_c(F,*nu)+interp_c(F,*nd)
Re_w=3.05    # DC-weerstand wooferpaar parallel
CAND={
 'HUIDIG (2e orde)'   : (VV.build(), {}),
 'KAND-A (2e orde)'   : (VV.build(), pickle.load(open('cand2_2.7.pkl','rb'))),
 'KAND-B (3e orde)'   : (VV.build(VV.v_extraL), build_ov(pickle.load(open('robust_lab.pkl','rb')))),
}
SPACING={'wm':0.2758,'mt':0.1292}
rows={}
for tag,(js,ov) in CAND.items():
    net=FastNet(js,DL,F)
    Zin,V=net.solve(ov)
    Hel=V['woofer']/2.83
    b,bare,fb=lf_bump(F,ZD['woofer'],Hel,NFc)
    Zs=thevenin(net,ov,'woofer',ZD['woofer'])
    ifs=np.argmin(abs(F-52.3)); Rs=Zs[ifs].real
    e=epdr(Zin)
    # dissipatie in elke weerstand
    net.solve(ov)
    diss={}
    for t,pid,model,a,bb,p in net.elems:
        if t=='Resistor':
            Rv=ov.get((pid,'R'), [q for q in p['params'] if q['name']=='R'][0]['value'])
            diss[pid]=dissipation(F,Zin,net.element_current(pid,ov),Rv)
    rows[tag]=dict(bump=b,bare=bare,fb=fb,Rs=Rs,q=qts_mult(Rs,Re_w),
                   zmin=np.abs(Zin).min(),epdr=e.min(),epdrf=F[np.argmin(e)],
                   phmax=np.degrees(np.angle(Zin))[np.argmax(np.abs(np.angle(Zin)))],diss=diss)
XO={'HUIDIG (2e orde)':(359,2240),'KAND-A (2e orde)':(452,2452),'KAND-B (3e orde)':(446,2499)}
print('=== 1. LF-BULT (grens 2,5 dB) ===   kale kastafstemming = %+.2f dB'%rows['KAND-B (3e orde)']['bare'])
for t,r in rows.items(): print('  %-20s %+5.2f dB @ %3.0f Hz   %s'%(t,r['bump'],r['fb'],'OK' if r['bump']<=2.5 else 'OVERSCHRIJDING'))
print('\n=== 2. BRONWEERSTAND / Qes-VERMENIGVULDIGING (grens 1,5x) ===')
for t,r in rows.items(): print('  %-20s Rs %4.2f \u03a9  ->  Qes x %.2f   %s'%(t,r['Rs'],r['q'],'OK' if r['q']<=1.5 else 'OVERSCHRIJDING'))
print('\n=== 3. DISSIPATIE bij 100 W IEC-programmaruis (grens 10 W = MOX) ===')
for t,r in rows.items():
    w=sorted(r['diss'].items(),key=lambda kv:-kv[1])[:3]
    tot=sum(r['diss'].values())
    print('  %-20s %s | totaal %.0f%% van het versterkervermogen'%(
        t,'  '.join('%s %.1fW (%.0f%%)'%(k,v,v) for k,v in w),tot))
print('\n=== 4. LOBING (grens 0,50 \u03bb) ===')
for t in rows:
    fw,fm=XO[t]
    lw=lobing(fw,SPACING['wm']); lm=lobing(fm,SPACING['mt'])
    print('  %-20s W-M %4.0f Hz = %.2f\u03bb %s | M-T %4.0f Hz = %.2f\u03bb %s'%(
        t,fw,lw,'OK ' if lw<=0.5 else 'FOUT',fm,lm,'OK' if lm<=0.5 else 'FOUT'))
print('\n=== 5. EPDR (grens 1,6 \u03a9 voor 4\u03a9-stabiele versterker) ===')
for t,r in rows.items():
    print('  %-20s min|Z| %.2f  min EPDR %.2f \u03a9 @ %4.0f Hz  maxfase %+3.0f\u00b0  %s'%(
        t,r['zmin'],r['epdr'],r['epdrf'],r['phmax'],'OK' if r['epdr']>=1.6 else 'KRAP'))
