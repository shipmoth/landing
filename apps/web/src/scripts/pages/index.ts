// Home page entry. Keep the inits in this order: it fixes the order of random draws, timers and
// listeners, which the seeded e2e and visual tests (and their committed snapshots) rely on.
import { decodeArt } from '@shipmoth/ascii-art';
import hero from '@shipmoth/ascii-art/hero';
import wordmark from '@shipmoth/ascii-art/wordmark';
import { initAsciiFrames } from '../features/ascii-frames';
import { initTabTitle } from '../features/tab-title';
import { initHeroMoth } from '../features/hero-moth';
import { initWordmark } from '../features/wordmark';
import { initTypewriter } from '../features/typewriter';
import { initSpinner } from '../features/spinner';
import { initContact } from '../features/contact';
import { initSwarm } from '../features/swarm';
import { initIdeaLine } from '../features/idea-line';

initAsciiFrames();
initTabTitle();
initHeroMoth(decodeArt(hero));
initWordmark(decodeArt(wordmark));
initTypewriter();
initSpinner();
initContact();
initSwarm();
initIdeaLine();
