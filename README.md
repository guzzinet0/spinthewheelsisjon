# Gladiatorarenan 3D

Elva gladiatorer i en colosseum i 3D. Välj vilka som ska kliva in på sanden, starta striden, och den som står kvar sist vinner.
Alla krigare har **exakt lika stor chans att vinna**.

- **3D-grafik** med [Three.js]: skuggor, ljus som byter med arenan (solsken, solnedgång, natt, vinter), facklor, publik som jublar och en eldring som kryper in.
- **Fysik**: krigarna är stela kroppar som knuffas, studsar mot varandra och mot väggen. Den som faller blir en ragdoll ([cannon-es]) och tappar vapen och sköld.
- **Riktiga ljudfiler**: 26 `.wav`-filer i `public/sounds/`, panorerade efter var på arenan det händer.
- **Rättvisetest** inne i spelet: 1000 osynliga strider körs i bakgrunden med samma regelfil som den riktiga matchen.

## Kom igång

Du behöver [Node.js](https://nodejs.org) 20 eller senare.

```bash
npm install
npm run dev
```

Öppna adressen som visas (oftast http://localhost:5173).

## Lägg upp spelet med en länk

```bash
npm run build
```

Då hamnar hela spelet i mappen `dist/`. Den mappen är en vanlig statisk webbplats och fungerar var som helst, även i en undermapp.

- **GitHub Pages (automatiskt):** lägg projektet i ett GitHub-repo, gå till *Settings → Pages* och välj *Source: GitHub Actions*. Varje push till `main` kör rättvisetestet, bygger spelet och lägger upp det på `https://<ditt-namn>.github.io/<repo>/`. Arbetsflödet finns i `.github/workflows/deploy.yml`.
- **Netlify Drop:** dra mappen `dist/` till https://app.netlify.com/drop så får du en länk direkt.
- **Egen server:** kopiera innehållet i `dist/` till webbservern.

Öppna inte `dist/index.html` direkt från disken (`file://`). Webbläsare blockerar då ljudfiler och web workers. Använd `npm run preview` för att testa bygget lokalt.

## Varför det är rättvist

All logik som avgör vem som vinner ligger i en enda fil, [`src/game/sim.js`](src/game/sim.js). Den känner inte till hur någon ser ut.

- Alla har samma liv, skada, fart, räckvidd, undvikande-, parerings- och kritchans.
- I fysiken är alla samma cirkel med samma massa. Rustning och vapen är bara utseende i [`src/game/roster.js`](src/game/roster.js).
- Alla attacker träffar i exakt samma ögonblick av svingen, oavsett vilken animation som visas.
- Startplatser lottas, och ordningen som krigarna behandlas i blandas om varje tick.
- Lejonet och vagnen kommer i en slumpad bana i en slumpad vinkel.
- Spelet körs med fast tidssteg (30 tick/s) både på skärmen och i rättvisetestet, så testet spelar exakt samma regler.
- Ragdolls, tappade vapen och partiklar är bara utseende och påverkar aldrig reglerna.

Kör testet själv:

```bash
npm run fairness   # 20 000 strider, skriver ut vinstandel per krigare
npm test           # chi²-test som misslyckas om någon gynnas
```

## Ljud

Ljudfilerna skapas av `scripts/generate-sounds.mjs` (`npm run sounds`), som syntetiserar svärdssvingar, metallklang, träffar, trummor, horn, fanfar, publik, lejonvrål, vagnsmuller, eld och åska till vanliga `.wav`-filer.
Vill du hellre ha inspelade ljud lägger du dina egna filer i `public/sounds/` med samma namn.

## Projektets delar

| Fil | Vad den gör |
| --- | --- |
| `src/game/sim.js` | Reglerna och spelfysiken (ren JS, ingen grafik) |
| `src/game/roster.js` | Krigarnas namn och utseende |
| `src/game/fairness.worker.js` | Kör osynliga strider i bakgrunden |
| `src/render/fighter.js` | 3D-modell och animation (IK för armar och ben) |
| `src/render/physics.js` | Ragdolls och tappade vapen med cannon-es |
| `src/render/arena.js` | Colosseum, publik, facklor, teman och eldringen |
| `src/render/creatures.js` | Lejonet och vagnen |
| `src/render/effects.js` | Partiklar och blixtar |
| `src/audio/sfx.js` | Laddar och spelar ljudfilerna |
| `src/main.js` | Kopplar ihop allt: loop, kamera, knappar |

Den ursprungliga 2D-versionen finns kvar i `Gladiatorarenan.html`.

[Three.js]: https://threejs.org
[cannon-es]: https://github.com/pmndrs/cannon-es
