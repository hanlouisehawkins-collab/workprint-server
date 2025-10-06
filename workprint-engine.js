// workprint-engine.js
// Minimal scoring engine — we’ll expand it question by question.

const mapping = {
  1: { A: ["ES","FT"], B: ["En","In"], C: ["EC"], D: ["Com"] },
  2: { A: ["Ad"], B: ["Ad"], C: ["ES","FT"], D: ["Ad","ES"] },
  3: { A: ["Com","CR"], B: ["EC"], C: ["Com","EC"], D: ["EC","CR"] },
  4: { A: ["In"], B: ["FT"], C: ["Com","Ad"], D: ["FT","In"] },
  5: { A: ["ES"], B: ["In","Ad"], C: ["Com"], D: ["FT"] },
  6: { A: ["CR"], B: ["EC"], C: ["CR"], D: ["Com","CR"] },
  7: { A: ["En"], B: ["En","EC"], C: ["Ad"], D: ["ES","FT"] },
  8: { A: ["Ad"], B: ["ES"], C: ["EC","ES"], D: ["In","En"] },
  9: { A: ["Com"], B: ["In"], C: ["EC"], D: ["FT"] },
 10: { A: ["FT"], B: ["Com","EC"], C: ["Ad"], D: ["En"] },
 11: { A: ["EC"], B: ["FT"], C: ["Com"], D: ["CR"] },
 12: { A: ["FT"], B: ["Ad"], C: ["Com"], D: ["En","In"] },
 13: { A: ["ES"], B: ["En"], C: ["Ad"], D: ["EC"] },
 14: { A: ["In"], B: ["EC"], C: ["Ad"], D: ["FT"] },
 15: { A: ["ES","FT"], B: ["In","FT"], C: ["Ad"], D: ["En"] },
 16: { A: ["Com"], B: ["Ad"], C: ["FT"], D: ["In"] },
 17: { A: ["FT"], B: ["En","In"], C: ["EC"], D: ["Com"] },
 18: { A: ["EC"], B: ["CR"], C: ["EC"], D: ["Com"] },
};

function newCounters() {
  return { En:0, In:0, Ad:0, FT:0, ES:0, Com:0, CR:0, EC:0 };
}

function applyChoice(state, qNumber, answer) {
  const qMap = mapping[qNumber];
  if (!qMap) return state;                    // unknown question → no change
  const addTraits = qMap[ String(answer).toUpperCase() ];
  if (!addTraits) return state;               // unknown answer → no change
  addTraits.forEach(trait => { state[trait]++ });
  return state;
}

// Export for later use in index.js
function getProfile(scores) {
  const En = scores.En, In = scores.In, Ad = scores.Ad,
        FT = scores.FT, ES = scores.ES, Com = scores.Com,
        CR = scores.CR, EC = scores.EC;

  if (En >= 3 && In >= 3 && (Ad >= 2 || CR >= 2)) return "Firestarter";
  if (En >= 3 && In <= 2 && (Ad >= 2 || Com >= 2)) return "Spark";
  if (FT >= 4 && ES >= 3) return "Closer";
  if (ES >= 3 && FT >= 3 && EC >= 2) return "Architect";
  if (Com >= 4 && EC >= 3 && !(In >= 3) && !(FT >= 3 && EC >= 4 && Com <= 3)) return "Connector";
  if (EC >= 4 && FT >= 3 && Com <= 3) return "Anchor";
  if (Ad >= 4 && EC >= 3) return "Shapeshifter";
  if (EC >= 3 && (ES >= 3 || FT >= 3) && !(En >= 2) && !(Ad >= 4)) return "Strategist";
    // Fallback: pick the profile whose strongest traits are highest
  const topTrait = Object.keys(scores).reduce((a,b) => scores[a] > scores[b] ? a : b);
  const traitToProfile = {
    En: "Firestarter",
    In: "Spark",
    FT: "Closer",
    ES: "Architect",
    Com: "Connector",
    EC: "Anchor",
    Ad: "Shapeshifter",
    CR: "Strategist",
  };
  return traitToProfile[topTrait] || "Strategist";
}


module.exports = { newCounters, applyChoice, getProfile };

/* Quick self-test: run `node workprint-engine.js` in the Replit shell:
   Expected output after choosing Q1:A → ES+1 and FT+1
*/
if (require.main === module) {
  const s = newCounters();
  applyChoice(s, 1, "A");
  console.log(s);
}
