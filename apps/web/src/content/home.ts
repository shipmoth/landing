// Copy for the home page sections that repeat a shape. One-off paragraphs live in pages/index.astro.
import { art, type Colour } from './colours';

export interface Goal {
  name: string;
  colour: Colour;
  /** small ascii icon above the name */
  icon: string;
  text: string;
}

/** "what we go after": three tiles, each with an icon and a draining meter. */
export const goals: Goal[] = [
  {
    name: 'time',
    colour: 'y',
    icon: art(
      '._____.',
      ' \\ : / ',
      '  ) (  ',
      ' /_:_\\ ',
    ),
    text: 'twenty minutes of comparing tabs, calling around and waiting to hear back.',
  },
  {
    name: 'space',
    colour: 'v',
    icon: art(
      '+--+   ',
      '|  +--+',
      '+--|  |',
      '   +--+',
    ),
    text: 'five apps, three group chats and a spreadsheet, all for one simple plan.',
  },
  {
    name: 'steps',
    colour: 'p',
    icon: art(
      '      _',
      '    _| ',
      '  _|   ',
      '_|     ',
    ),
    text: 'every form, login and "we\'ll get back to you" between wanting a thing and having it.',
  },
];

export interface Product {
  /** product name; also the section id and the link anchor */
  id: string;
  colour: Colour;
  lede: string;
  pitch: string;
  before: string;
  after: string;
  /** where "[ open … ]" goes. Points at its own section until the product has a real URL. */
  href: string;
}

/** "off the line": one crate-style card per product. */
export const products: Product[] = [
  {
    id: 'lride',
    colour: 'y',
    lede: 'learning to drive, without the phone calls.',
    pitch:
      'lride makes learning to drive simpler by helping learners discover driving schools, connect with instructors, and take the first step towards driving with confidence.',
    before: 'ask around, call schools one by one, compare prices that nobody publishes.',
    after: 'see schools near you, pick an instructor who fits, book the first lesson from your phone.',
    href: '#lride',
  },
  {
    id: 'lwatch',
    colour: 'v',
    lede: 'a film, and someone to watch it with.',
    pitch:
      'lwatch brings movies and people together, helping you discover films, connect with people who share your taste, and find someone to watch with.',
    before: 'forty minutes of scrolling, a group chat that never agrees, and watching alone anyway.',
    after: 'films picked from what you actually like, and people nearby who like them too.',
    href: '#lwatch',
  },
  {
    id: 'lglow',
    colour: 'p',
    lede: 'your next look starts here.',
    pitch:
      'lglow helps you find the right salon, book appointments, and explore hairstyles that suit you with ai-powered previews.',
    before: 'screenshots shown to a stylist, a hopeful nod, and six weeks of growing it out.',
    after: 'try the cut on your own face first, then book the salon that does it well.',
    href: '#lglow',
  },
];

export interface Step {
  title: string;
  text: string;
}

/** "how the factory runs": the flowchart boxes, top to bottom. */
export const steps: Step[] = [
  { title: 'find a friction', text: 'something people do every week that takes longer than it should.' },
  { title: 'build the smallest fix', text: 'one job per app. nothing that needs a tutorial.' },
  { title: 'ship it early', text: 'to real people, with the rough edges showing.' },
  { title: 'keep it or kill it', text: 'keep what saves people time. retire the rest, without ceremony.' },
  { title: 'start the next one', text: 'it does not have to be related. it usually is not.' },
];
