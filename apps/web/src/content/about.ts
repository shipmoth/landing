// Copy for the about page's crew cards and lab photo wall.
import { art, type Colour } from './colours';
import { BIOS, type CrewName } from './bios';
import arjun from '../art/portraits/arjun.html?raw';
import alan from '../art/portraits/alan.html?raw';
import ijas from '../art/portraits/ijas.html?raw';
import jose from '../art/portraits/jose.html?raw';

export interface Mate {
  /** lower-case name: the card title and its data-name (the crew scripts key bios and moths on it) */
  name: CrewName;
  colour: Colour;
  /** coloured ascii self-portrait: the inner html of its <pre> */
  portrait: string;
  /** the default bio line (the first of its BIOS options); the crew script swaps in a random one on load */
  bio: string;
  tag: string;
}

/** "the crew", in source order (the page shuffles them on load). */
export const crew: Mate[] = [
  { name: 'arjun', colour: 'p', portrait: arjun, bio: BIOS.arjun[0], tag: '[ art & design ]' },
  { name: 'alan', colour: 'y', portrait: alan, bio: BIOS.alan[0], tag: '[ engineering ]' },
  { name: 'ijas', colour: 't', portrait: ijas, bio: BIOS.ijas[0], tag: '[ backend ]' },
  { name: 'jose', colour: 'v', portrait: jose, bio: BIOS.jose[0], tag: '[ operations ]' },
];

export interface LabPhoto {
  colour: Colour;
  /** tile shape as an aspect ratio, e.g. 4/5 portrait, 3/2 landscape */
  ratio: string;
  /** ascii stand-in shown until there is a photo */
  doodle: string;
  caption: string;
}

/**
 * "the lab": the masonry photo wall. Photo n is img/lab-n.jpg; its caption doubles as the alt text.
 */
export const lab: LabPhoto[] = [
  {
    colour: 'y',
    ratio: '4/5',
    caption: 'whiteboard, day three',
    doodle: art(
      '.--------.',
      '|->[]->??|',
      '| !! <-  |',
      "'--------'",
      '  /    \\  ',
    ),
  },
  {
    colour: 'v',
    ratio: '1/1',
    caption: 'the coffee run',
    doodle: art(
      '   ( (    ',
      '  ) )     ',
      ' .-----.  ',
      ' |     |] ',
      " '-----'  ",
    ),
  },
  {
    colour: 'p',
    ratio: '3/4',
    caption: 'late nights',
    doodle: art(
      '  *    .  ',
      ' .   (    ',
      '   *  (   ',
      '  .   (  *',
      ' *     .  ',
    ),
  },
  {
    colour: 't',
    ratio: '3/2',
    caption: 'the desk situation',
    doodle: art(
      ' [=]  [ ]~',
      '  |  __|  ',
      '._|__|___.',
      '|        |',
      '|        |',
    ),
  },
  {
    colour: 'y',
    ratio: '4/5',
    caption: 'launch day',
    doodle: art(
      '    /\\    ',
      '   |  |   ',
      '   |  |   ',
      '  /|__|\\  ',
      '   /\\/\\   ',
    ),
  },
  {
    colour: 'v',
    ratio: '4/3',
    caption: 'team lunch',
    doodle: art(
      ' ________ ',
      ' \\ o  . / ',
      '  \\  o /  ',
      '   \\  /   ',
      '    \\/    ',
    ),
  },
  {
    colour: 'p',
    ratio: '1/1',
    caption: 'the chaos corner',
    doodle: art(
      ' ?!  @#   ',
      '   %& !?  ',
      ' #!  ?%   ',
      '  &?  !#  ',
      '     ?    ',
    ),
  },
  {
    colour: 't',
    ratio: '3/4',
    caption: 'the moth, supervising',
    doodle: art(
      '          ',
      '  \\   /   ',
      '  }-o-{   ',
      '          ',
      '   o_O    ',
    ),
  },
];
