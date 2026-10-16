// About page entry. Keep the inits in this order: it fixes the order of random draws, timers and
// listeners, which the seeded e2e and visual tests (and their committed snapshots) rely on.
import { initAsciiFrames } from '../features/ascii-frames';
import { initCrew } from '../features/crew';
import { initCrewOrbit } from '../features/crew-orbit';
import { initTabTitle } from '../features/tab-title';
import { initTypewriter } from '../features/typewriter';
import { initSpinner } from '../features/spinner';
import { initContact } from '../features/contact';
import { initSwarm } from '../features/swarm';
import { initIdeaLine } from '../features/idea-line';

initAsciiFrames();
initCrew();
initCrewOrbit();
initTabTitle();
initTypewriter();
initSpinner();
initContact();
initSwarm();
initIdeaLine();
