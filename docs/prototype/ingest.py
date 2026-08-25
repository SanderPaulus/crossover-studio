# Demonstratie "meetopname-pas": afgeleide parameters UITSLUITEND uit de bestanden
# + manifest-tags. Geen enkele hardgecodeerde frequentie.
import sys; sys.path.insert(0,'/home/claude/xo')
import numpy as np
from adsio import read_lim, read_frd, interp_c
dB=lambda x:20*np.log10(np.abs(x)+1e-30)

def smooth_oct(F,d,frac=2):
    out=np.empty_like(d)
    for i,f0 in enumerate(F):
        m=(F>=f0*2**(-0.5/frac))&(F<=f0*2**(0.5/frac))
        out[i]=d[m].mean()
    return out

def derive_impedance(f,z):
    a=np.abs(z); out={'Re_est':float(a[:max(3,len(a)//50)].min())}
    pk=[]
    for i in range(2,len(f)-2):
        if a[i]>a[i-1] and a[i]>a[i+1] and a[i]>1.5*out['Re_est']:
            half=(a[i]+out['Re_est'])/2
            li=i
            while li>0 and a[li]>half: li-=1
            ri=i
            while ri<len(f)-1 and a[ri]>half: ri+=1
            pk.append({'f':float(f[i]),'Z':float(a[i]),'Q':float(f[i]/max(f[ri]-f[li],1e-9))})
    out['peaks']=pk
    if pk: out['fs_upper']=pk[-1]['f'] if len(pk)>1 else pk[0]['f']
    return out

def derive_spl(f,p,lo=None,hi=None):
    lo=lo or f[0]*1.3; hi=hi or f[-1]/1.05
    F=np.logspace(np.log10(lo),np.log10(hi),500); P=interp_c(F,f,p)
    d=dB(P); r=d-smooth_oct(F,d,2); pk=[]
    for i in range(3,len(F)-3):
        if r[i]>r[i-1] and r[i]>r[i+1] and r[i]>0.7:
            pk.append({'f':float(F[i]),'dB':float(r[i])})
    return {'ripple_rms':float(np.sqrt(np.mean(r**2))),'peaks':pk}

MANIFEST={  # wat de gebruiker bij upload tagt (of uit headers komt)
 'woofers_parallel__1_.lim':dict(drv='woofer',typ='Z'),
 'mid.lim':dict(drv='mid',typ='Z'), 'tweeter.lim':dict(drv='tweeter',typ='Z'),
 'woofer_up_near.txt':dict(drv='woofer',typ='NF',D_inch=7.6),
 'woofer_up_hor_0.txt':dict(drv='woofer',typ='FF',ang=0),
 'woofer_down_hor_0.txt':dict(drv='woofer',typ='FF',ang=0),
 'mid_near.txt':dict(drv='mid',typ='NF',D_inch=4.0),
 'mid_hor_0.txt':dict(drv='mid',typ='FF',ang=0),
 'mid_hor_30.txt':dict(drv='mid',typ='FF',ang=30),
 'tweeter_hor_0.txt':dict(drv='tweeter',typ='FF',ang=0)}
U='/mnt/user-data/uploads/'
DERIVED={}
for fn,tag in MANIFEST.items():
    d=tag['drv']; DERIVED.setdefault(d,{'FF_angles':set()})
    if tag['typ']=='Z':
        f,z=read_lim(U+fn); DERIVED[d]['Z']=derive_impedance(f,z)
    elif tag['typ']=='NF':
        DERIVED[d]['NF_fmax']=4311.0/tag['D_inch']; DERIVED[d]['NF']=True
    elif tag['typ']=='FF':
        DERIVED[d]['FF_angles'].add(tag['ang'])
        if tag['ang']==0:
            f,p=read_frd(U+fn); DERIVED[d].setdefault('SPL',derive_spl(f,p))
print('AFGELEIDE PARAMETERS (louter uit bestanden + manifest):')
for d,v in DERIVED.items():
    z=v.get('Z',{})
    fp=z.get('peaks',[])
    print('  %-8s Re~%.2f | Z-pieken: %s | NF geldig tot %s | SPL-pieken: %s'%(
      d, z.get('Re_est',float('nan')),
      ', '.join('%.0fHz(Q%.1f)'%(q['f'],q['Q']) for q in fp) or '-',
      ('%.0f Hz'%v['NF_fmax']) if 'NF_fmax' in v else 'geen NF',
      ', '.join('%.0fHz+%.1f'%(q['f'],q['dB']) for q in v.get('SPL',{}).get('peaks',[])[:3]) or '-'))
print()
print('CAPABILITY-MATRIX (welke metriek actief kan zijn):')
REQ={'M-A dissipatie':lambda v:True,'M-B EPDR':lambda v:True,
     'M-C V@fs':lambda v:'Z' in v,
     'M-D LF-bult':lambda v:v.get('NF') and 'Z' in v,
     'M-E Thevenin':lambda v:'Z' in v,
     'M-G directiviteit':lambda v:len(v['FF_angles'])>=2,
     'M-H breakup':lambda v:'SPL' in v}
for m,req in REQ.items():
    st=['%s:%s'%(d,'AAN' if req(v) else 'uit') for d,v in DERIVED.items()]
    print('  %-18s %s'%(m,'  '.join(st)))
