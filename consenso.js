// Motor de consenso de PlanListo.
// No toca la pantalla ni internet: solo recibe los votos y calcula.
//
// Cada persona le pone un nivel a cada opción:
//   pref = ❤️ Prefiero / Ideal      (+3 puntos)
//   si   = ✅ Puedo / Me sirve        (+2 puntos)
//   tal  = 🟡 Podría / Me queda incómodo (+1 punto)
//   no   = 🚫 No puedo / No voy      (0 puntos y cuenta como "no puede")

export const ORDER = ['pref', 'si', 'tal', 'no'];

export const LEVELS = {
  cuando:      { pref: '❤️ Prefiero', si: '✅ Puedo',    tal: '🟡 Podría',            no: '🚫 No puedo' },
  donde:       { pref: '❤️ Ideal',    si: '✅ Me sirve', tal: '🟡 Si no hay otra',    no: '🚫 No quiero' },
  zona:        { pref: '❤️ Ideal',    si: '✅ Me sirve', tal: '🟡 Me queda incómodo', no: '🚫 No voy hasta ahí' },
  presupuesto: { pref: '❤️ Ideal',    si: '✅ Me sirve', tal: '🟡 Me cuesta',         no: '🚫 No me da' }
};

export const POINTS = { pref: 3, si: 2, tal: 1, no: 0 };

// P = un plan con esta forma:
// { people:[nombres], rule:{mode,required}, cuando:{options,votes,round}, donde:{...}, ... }
// y votes = { nombre: { idOpcion: 'pref' | 'si' | 'tal' | 'no' } }

export function ruleOf(P) {
  return P.rule || { mode: 'mayoria', required: [] };
}

export function ruleText(P) {
  const r = ruleOf(P);
  if (r.mode === 'umbral') return 'tiene que poder el 80 % del grupo';
  if (r.mode === 'imprescindibles' && r.required && r.required.length) {
    return 'tienen que poder ' + r.required.join(', ') + ' sí o sí';
  }
  return 'mayoría simple';
}

export function tallyStage(P, k) {
  return P[k].options.map(function (o) {
    const c = { pref: 0, si: 0, tal: 0, no: 0 };
    P.people.forEach(function (p) {
      const v = (P[k].votes[p] || {})[o.id];
      if (v && c[v] !== undefined) c[v]++;
    });
    return {
      o: o,
      pref: c.pref, si: c.si, tal: c.tal, no: c.no,
      can: c.pref + c.si,                       // cuántas personas pueden
      score: c.pref * 3 + c.si * 2 + c.tal      // puntos
    };
  });
}

// ¿a es mejor que b? Primero puntos, después cuántos pueden, después menos "no".
export function better(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.can !== b.can) return a.can > b.can;
  return a.no < b.no;
}
export function sameRank(a, b) {
  return a.score === b.score && a.can === b.can && a.no === b.no;
}

// Calcula las opciones que cumplen la regla, la mejor, y si hay empate.
export function evalStage(P, k) {
  const N = P.people.length;
  const r = ruleOf(P);
  const t = tallyStage(P, k).map(function (x) {
    let ok = x.score > 0;
    if (k === 'cuando') {
      if (r.mode === 'umbral') {
        ok = N > 0 && x.can / N >= 0.8;
      } else if (r.mode === 'imprescindibles' && r.required && r.required.length) {
        ok = r.required.every(function (n) {
          const v = (P.cuando.votes[n] || {})[x.o.id];
          return v === 'pref' || v === 'si';
        });
      }
    }
    x.ok = ok;
    return x;
  });
  const okList = t.filter(function (x) { return x.ok; });
  let top = null;
  okList.forEach(function (x) { if (!top || better(x, top)) top = x; });
  const tied = top ? okList.filter(function (x) { return sameRank(x, top); }) : [];
  const anyVote = t.some(function (x) { return x.pref + x.si + x.tal + x.no > 0; });
  return { tally: t, tied: tied, anyVote: anyVote };
}

export function bestOf(P, k) {
  const e = evalStage(P, k);
  return e.tied.length === 1 ? e.tied[0] : null;
}
export function tiedOf(P, k) {
  const e = evalStage(P, k);
  return e.tied.length > 1 ? e.tied : [];
}

// Para el modo "Resolvamos esto": la mejor opción posible aunque haya empate o falten votos.
export function pickFor(P, k) {
  const e = evalStage(P, k);
  let cand = e.tally.filter(function (x) { return x.ok; });
  if (!cand.length) cand = e.tally.filter(function (x) { return x.score > 0; });
  let best = null;
  cand.forEach(function (x) { if (!best || better(x, best)) best = x; });
  if (best) return { item: best, voted: true };
  const first = P[k].options[0];
  return { item: first ? { o: first, pref: 0, si: 0, tal: 0, no: 0, can: 0, score: 0 } : null, voted: false };
}

export function votedCount(P, k) {
  return P.people.filter(function (p) {
    const v = P[k].votes[p];
    return v && Object.keys(v).length > 0;
  }).length;
}

// Porcentaje de consenso: puntos obtenidos sobre el máximo posible (todos ❤️).
export function consensusPct(P, x) {
  const N = P.people.length;
  return N ? Math.round((x.score / (3 * N)) * 100) : 0;
}

// "Time to plan": cuánto tardó el grupo desde que se creó el plan hasta que se cerró.
export function durationText(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return min + (min === 1 ? ' minuto' : ' minutos');
  const hrs = Math.floor(min / 60);
  if (hrs < 24) {
    const m = min % 60;
    return hrs + (hrs === 1 ? ' hora' : ' horas') + (m ? ' y ' + m + ' min' : '');
  }
  const days = Math.floor(hrs / 24);
  const h = hrs % 24;
  return days + (days === 1 ? ' día' : ' días') + (h ? ' y ' + h + ' h' : '');
}
