export type Body = 'Earth' | 'Moon' | 'Mars';
export interface Visual { src: string; alt: string; credit: string; url: string; body: Body; position?: string }

const nasa = (id: string) => `https://images.nasa.gov/details/${id}`;

/** NASA public-domain photographs used as context imagery (never as analysis data). */
export const VISUALS = {
  moonRover: { src: '/visuals/as15-88-11901.jpg', alt: 'Apollo 15 Lunar Roving Vehicle on the lunar surface, Hadley-Apennine, 1971', credit: 'Apollo 15, AS15-88-11901 · NASA/JSC', url: nasa('as15-88-11901'), body: 'Moon', position: 'center 60%' },
  moonGeology: { src: '/visuals/as17-140-21496.jpg', alt: 'Apollo 17 geologist Harrison Schmitt beside a split boulder at Taurus-Littrow, 1972', credit: 'Apollo 17, AS17-140-21496 · NASA/JSC', url: nasa('as17-140-21496'), body: 'Moon', position: 'center 55%' },
  moonDeploy: { src: '/visuals/as11-40-5948.jpg', alt: 'Buzz Aldrin after deploying the Early Apollo Scientific Experiments Package, 1969', credit: 'Apollo 11, AS11-40-5948 · NASA/JSC', url: nasa('as11-40-5948'), body: 'Moon', position: 'center 60%' },
  moonDust: { src: '/visuals/as11-40-5877.jpg', alt: 'Apollo 11 bootprint in lunar regolith, 1969', credit: 'Apollo 11, AS11-40-5877 · NASA', url: nasa('as11-40-5877'), body: 'Moon' },
  moonPole: { src: '/visuals/PIA13523.jpg', alt: 'Mosaic of the lunar south polar region from the Lunar Reconnaissance Orbiter Camera', credit: 'The Lunar South Pole, PIA13523 · NASA/GSFC/Arizona State University', url: nasa('PIA13523'), body: 'Moon' },
  marsRover: { src: '/visuals/PIA24542.jpg', alt: 'Perseverance rover self-portrait in Jezero crater with the Ingenuity helicopter, 2021', credit: 'Perseverance, PIA24542 · NASA/JPL-Caltech/MSSS', url: nasa('PIA24542'), body: 'Mars', position: 'center 55%' },
  marsDrill: { src: '/visuals/PIA19140.jpg', alt: 'Drill hole made by Curiosity at Telegraph Peak, Gale crater, 2015', credit: 'Curiosity, PIA19140 · NASA/JPL-Caltech/MSSS', url: nasa('PIA19140'), body: 'Mars' },
  marsDust: { src: '/visuals/PIA25290.jpg', alt: 'Dust devils crossing Jezero crater, seen by Perseverance, 2022', credit: 'Perseverance, PIA25290 · NASA/JPL-Caltech', url: nasa('PIA25290'), body: 'Mars' },
  marsStorm: { src: '/visuals/PIA22486.jpg', alt: 'Curiosity self-portrait during the 2018 global dust storm, Gale crater', credit: "Curiosity's Dusty Selfie, PIA22486 · NASA/JPL-Caltech/MSSS", url: nasa('PIA22486'), body: 'Mars', position: 'center 45%' },
  marsLandscape: { src: '/visuals/mars_gediz_PIA26019.jpg', alt: 'Curiosity panorama of Gediz Vallis Ridge, Mount Sharp', credit: 'Curiosity, PIA26019 · NASA/JPL-Caltech/MSSS', url: nasa('PIA26019'), body: 'Mars', position: 'center 35%' },
  chamber: { src: '/visuals/GSFC_20171208_Archive_e000745.jpg', alt: "Webb telescope Pathfinder test model being prepared for a cryogenic test in Chamber A, NASA Johnson Space Center", credit: 'Chamber A, Johnson Space Center · NASA/GSFC', url: nasa('GSFC_20171208_Archive_e000745'), body: 'Earth', position: 'center 40%' },
} satisfies Record<string, Visual>;

/** Context photograph for an experiment, chosen from its id/name and the target body. */
export function experimentVisual(text: string, body: string | undefined): Visual {
  const t = text.toLowerCase();
  if (body === 'Mars') {
    if (/drill|geolog|sampl|core|astrobio/.test(t)) return VISUALS.marsDrill;
    if (/dust|aeolian|solar|power/.test(t)) return VISUALS.marsDust;
    if (/thermal|night|habitat/.test(t)) return VISUALS.marsStorm;
    if (/rover|navig|mobil|traverse|deploy|equipment/.test(t)) return VISUALS.marsRover;
    return VISUALS.marsLandscape;
  }
  if (/rover|navig|mobil|traverse/.test(t)) return VISUALS.moonRover;
  if (/geolog|sampl|core/.test(t)) return VISUALS.moonGeology;
  if (/deploy|equipment|instrument|seism/.test(t)) return VISUALS.moonDeploy;
  if (/dust|regolith|aeolian/.test(t)) return VISUALS.moonDust;
  return VISUALS.moonPole;
}

export function targetVisual(body: string | undefined): Visual {
  return body === 'Mars' ? VISUALS.marsRover : VISUALS.moonPole;
}
