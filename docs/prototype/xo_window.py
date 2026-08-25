"""A5d.3 — generieke kruisvenster-synthese. Input: afgeleide parameters uit de
opnamepas + geometrie. Geen hardgecodeerde frequenties (P6)."""
def window(pair, derived, geom, order_upper=2, c=343.0):
    A,B=pair; lo=[]; hi=[]; pref=[]
    lo.append(('meetgeldigheid', max(derived[A]['f_valid'], derived[B]['f_valid'])))
    k={1:3.0,2:2.0,3:1.6,4:1.4}[order_upper]
    lo.append(('%.1fx fs bovenste (orde %d)'%(k,order_upper), k*derived[B]['fs']))
    for fb,amp in derived[A].get('breakups',[])[:1]:
        div=3.0 if amp>=6.0 else 2.0+amp/6.0          # ernst-weging: ONGEKALIBREERD (HD-data)
        hi.append(('breakup %.0f Hz (+%.1f dB)/%.2f'%(fb,amp,div), fb/div))
    if 'dir_m6' in derived[A]:
        hi.append(('-6dB off-axis onderste', derived[A]['dir_m6']))
    if pair in geom:
        d=geom[pair]
        pref=[('breed frontaal',(0,0.45*c/d)),('SLECHTSTE zone',(0.5*c/d,0.7*c/d)),
              ('Kimmo-zone',(1.0*c/d,1.4*c/d))]
    flo=max(lo,key=lambda t:t[1]); fhi=min(hi,key=lambda t:t[1]) if hi else ('geen plafond',float('inf'))
    return dict(vloer=flo, plafond=fhi, alle_vloeren=lo, alle_plafonds=hi,
                voorkeurszones=pref, leeg=fhi[1]<=flo[1])
