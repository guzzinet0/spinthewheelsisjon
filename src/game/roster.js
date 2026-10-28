/* Looks only. Nothing in here is read by the rules in sim.js, so gear never changes the odds. */
export const ROSTER = [
  { name: "William", style: "Legionär", skin: "#d9a07a", armor: "segmentata", skirt: "tunic", cloth: "#9e2b25", cape: "#8c231e", helm: "legion", metal: "#b7bec5", crest: "#c4302a", weapon: "gladius", off: "scutum", shield: "#9e2b25", shieldTrim: "#d9a63a" },
  { name: "Anton", style: "Murmillo", skin: "#c68a62", armor: "bare", belt: "bronze", skirt: "loin", cloth: "#e8e0cc", helm: "murmillo", metal: "#c19a4a", manica: true, greaves: "#c19a4a", armband: true, weapon: "flail", off: "scutum", shield: "#2f5e3c", shieldTrim: "#c19a4a" },
  { name: "Tomas", style: "Nordman", skin: "#ecc3a2", armor: "mail", skirt: "mail", cloth: "#2e4f7a", helm: "nasal", metal: "#9aa3ab", beard: "#8a4a22", hair: "#8a4a22", mantle: true, weapon: "axe", off: "axe2" },
  { name: "Ludvig", style: "Hoplit", skin: "#d29a72", armor: "cuirass", skirt: "pteruges", cloth: "#7a3a1f", cape: "#6d1f1a", helm: "corinthian", metal: "#c39a45", crest: "#1d1612", greaves: "#c39a45", weapon: "spear", off: "aspis", shield: "#c39a45", shieldTrim: "#9e2b25" },
  { name: "Robin", style: "Retiarius", skin: "#7a4a2e", armor: "bare", belt: "leather", skirt: "loin", cloth: "#2e5a8a", helm: "retiarius", hair: "#16100c", manica: true, galerus: true, tattoo: true, strap: true, metal: "#b7bec5", weapon: "trident", off: "net" },
  { name: "Henrik", style: "Thraex", skin: "#e0ac86", armor: "bare", belt: "bronze", skirt: "loin", cloth: "#6a2a4a", helm: "thraex", metal: "#b8923f", crest: "#d9d2c2", manica: true, greaves: "#b8923f", wraps: true, weapon: "sica", off: "parmula", shield: "#6a2a4a", shieldTrim: "#b8923f" },
  { name: "Mattias", style: "Gallisk krigare", skin: "#efc9a8", armor: "bare", paint: "#3f6fb5", skirt: "fur", cloth: "#6b4a2b", cape: "#5a3f26", capeFur: true, helm: "wild", hair: "#d8b45a", moustache: "#c79e47", torc: true, armband: true, weapon: "greatsword", off: "2h" },
  { name: "Elias", style: "Dimachaerus", skin: "#b7835c", armor: "leather", skirt: "tunic", cloth: "#3a2a22", helm: "wrap", wrap: "#7a1e22", metal: "#b7bec5", weapon: "gladius", off: "sword2" },
  { name: "Samuel", style: "Järnriddare", skin: "#cf9a76", armor: "plate", skirt: "mail", cloth: "#2a2a30", helm: "bucket", metal: "#4a4f57", greaves: "#4a4f57", cape: "#1d1d22", pauldron: true, spiked: true, skull: true, weapon: "warhammer", off: "2h" },
  { name: "Oskar", style: "Secutor", skin: "#a86b44", armor: "bare", belt: "leather", skirt: "loin", cloth: "#c99a2e", helm: "secutor", metal: "#d3d8dd", manica: true, strap: true, greaves: "#b7bec5", weapon: "mace", off: "scutum", shield: "#c99a2e", shieldTrim: "#2a2a30" },
  { name: "", style: "Din egen krigare", custom: true, skin: "#dba57f", armor: "scale", skirt: "pteruges", cloth: "#4b2a6b", cape: "#5b2f86", helm: "champion", metal: "#d9b04a", crest: "#7d4bb3", greaves: "#d9b04a", pauldron: true, weapon: "longsword", off: "roundpaint", shield: "#5b2f86", shieldTrim: "#e2bb55" }
];
ROSTER.forEach((d, i) => { d.id = i; });

export const CUSTOM = ROSTER[10];
export const nameOf = d => d.custom ? (d.name.trim() || "Utmanaren") : d.name;
