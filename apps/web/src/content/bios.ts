// The crew's one-line bios. The first line of each list is the default printed in the html (and
// what a visitor without JavaScript sees); on load features/crew.ts swaps in a random one.
// Shared by the page (content/about.ts) and the browser script, so keep this file DOM-free.

export type CrewName = 'arjun' | 'alan' | 'ijas' | 'jose';

/** Edit the lines here. Keys match the `data-name` on each .crew child. */
export const BIOS: Readonly<Record<CrewName, readonly [string, ...string[]]>> = {
  arjun: [
    'makes things look good, then makes them move.',
    'pushes pixels until they push back.',
    'has opinions about kerning. strong ones.',
    'animates anything that sits still too long.',
    'draws the arrows on the whiteboard, then makes them prettier.'
  ],
  alan: [
    'turns whiteboard ideas into things that run.',
    'writes the code that makes the arrows real.',
    'ships it, then fixes it, then ships it again.',
    'reads error messages for fun. mostly.',
    'thinks in loops and dreams in stack traces.'
  ],
  ijas: [
    'keeps everything underneath quietly working.',
    'the reason the servers sleep well at night.',
    'speaks fluent database. reluctantly.',
    'makes the boring parts boring on purpose.',
    'guards the pipes nobody else wants to look at.'
  ],
  jose: [
    'runs the products and talks to the humans.',
    'answers the emails so the rest of us can hide.',
    'turns "can it do this?" into "it does now."',
    'keeps the lights on and the porch light brighter.',
    'says yes to customers, then tells us about it.'
  ]
};
