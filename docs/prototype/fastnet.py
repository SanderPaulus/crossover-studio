import numpy as np
UNIT={'mH':1e-3,'uF':1e-6,'nF':1e-9,'H':1.0,'F':1.0}

class FastNet:
    """Pre-compiles the netlist topology once; solve() is fully vectorised over frequency."""
    def __init__(self, js, drivers, F):
        self.F=F; self.w=2*np.pi*F; self.drivers=drivers
        parent={}
        def find(x):
            parent.setdefault(x,x)
            while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
            return x
        def union(a,b):
            ra,rb=find(a),find(b)
            if ra!=rb: parent[ra]=rb
        for p in js['parts']:
            w=[(c['x'],c['y']) for c in p['wires']]
            for c in w: find(c)
            if p['type']=='Wire':
                for a,b in zip(w,w[1:]): union(a,b)
        gnd=[find((p['wires'][0]['x'],p['wires'][0]['y'])) for p in js['parts'] if p['type']=='Ground']
        g0=gnd[0]
        for g in gnd: union(g,g0)
        self.gnd=find(g0)
        allr=sorted({find(c) for c in list(parent)})
        self.nodes=sorted({find(r) for r in allr}-{self.gnd})
        ii={n:i for i,n in enumerate(self.nodes)}; self.ii=ii
        self.N=len(self.nodes)
        self.elems=[]; self.src=None; self.drv=[]
        for p in js['parts']:
            t=p['type']
            if t in ('Wire','Ground'): continue
            a,b=[find((c['x'],c['y'])) for c in p['wires'][:2]]
            pa=ii.get(a,-1); pb=ii.get(b,-1)
            if t=='Generator':
                self.src=(pa, p['params'][0]['value']); continue
            if t=='Driver':
                self.drv.append((p['model'],pa,p.get('inverted',False))); 
            self.elems.append((t,p.get('partId'),p.get('model'),pa,pb,p))
        self.Zdrv={m:drivers[m]['Z'](F) for m in drivers}

    def _adm(self,t,p,ov):
        pid=p.get('partId'); g=lambda n,d: ov.get((pid,n), d)
        pv={q['name']:q for q in p.get('params',[])}
        if t=='Resistor': return np.full(len(self.F), 1.0/g('R',pv['R']['value']), complex)
        if t=='Inductor':
            L=g('L',pv['L']['value'])*UNIT[pv['L']['unit']]
            dcr=g('DCR',pv['DCR']['value'] if 'DCR' in pv else 0.0)
            return 1.0/(dcr+1j*self.w*L)
        if t=='Capacitor':
            C=g('C',pv['C']['value'])*UNIT[pv['C']['unit']]
            esr=g('ESR',pv['ESR']['value'] if 'ESR' in pv else 0.0)
            return 1.0/(esr+1.0/(1j*self.w*C))
        if t=='Driver': return 1.0/self.Zdrv[p['model']]
        raise ValueError(t)

    def solve(self, overrides=None):
        ov=overrides or {}
        nf=len(self.F); N=self.N
        Y=np.zeros((nf,N+1,N+1),complex)
        for t,pid,model,a,b,p in self.elems:
            y=self._adm(t,p,ov)
            if a>=0:
                Y[:,a,a]+=y
                if b>=0: Y[:,a,b]-=y
            if b>=0:
                Y[:,b,b]+=y
                if a>=0: Y[:,b,a]-=y
        ns,Eg=self.src
        Y[:,ns,N]=1.0; Y[:,N,ns]=1.0
        I=np.zeros((nf,N+1),complex); I[:,N]=Eg
        x=np.linalg.solve(Y,I[...,None])[...,0]
        self._x=x; self._Y=None
        Zin=Eg/(-x[:,N])
        V={}
        for m,node,inv in self.drv:
            v=x[:,node] if node>=0 else np.zeros(nf,complex)
            V[m]= -v if inv else v
        self._Zin=Zin
        return Zin,V

    def element_current(self, pid, ov=None):
        """|I| door element pid, per frequentie, bij de laatst opgeloste toestand."""
        ov=ov or {}
        for t,p_id,model,a,b,p in self.elems:
            if p_id!=pid: continue
            y=self._adm(t,p,ov)
            va=self._x[:,a] if a>=0 else 0.0
            vb=self._x[:,b] if b>=0 else 0.0
            return np.abs((va-vb)*y)
        raise KeyError(pid)
