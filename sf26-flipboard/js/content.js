import { SCENE_TYPES } from './constants.js';

export const content = {
  board: {
    rows: 8,
    cols: 30,
    railTop: 'SF26 LOBBY * CIVIC TECH SUMMIT * SAN FRANCISCO',
    railBottom: 'A=AUTOPLAY * O=HUD * M=MUTE * F=FULLSCREEN',
    defaultPlaylist: 'main',
    reducedMotionDwellBoostMs: 900,
  },
  playlists: {
    main: ['welcome', 'opening', 'nownext', 'roomchange', 'countdown', 'sponsor', 'wayfinding'],
    preShow: ['welcome', 'countdown', 'sponsor'],
    alerts: ['alertCapacity'],
  },
  quickKeys: {
    1: { playlist: 'main' },
    2: { playlist: 'preShow' },
    3: { playlist: 'alerts' },
    4: { scene: 'roomchange' },
    5: { scene: 'nownext' },
  },
  scenes: {
    welcome: {
      type: SCENE_TYPES.HERO,
      name: 'Welcome',
      dwellMs: 7000,
      visualMode: 'accent',
      rails: { top: 'SF26 MAIN LOBBY', bottom: 'DOORS OPEN * SESSION TRACKS LIVE' },
      payload: {
        headline: 'WELCOME TO SF26',
        subline: 'CIVIC TECH + ACCESSIBILITY',
      },
    },
    opening: {
      type: SCENE_TYPES.HERO,
      name: 'Opening Ceremony',
      dwellMs: 6500,
      rails: { top: 'GRAND HALL', bottom: 'OPENING CEREMONY * 7:00 PM' },
      payload: {
        headline: 'OPENING CEREMONY',
        subline: '7:00 PM * GRAND HALL',
      },
    },
    nownext: {
      type: SCENE_TYPES.NOW_NEXT,
      name: 'Now / Next',
      dwellMs: 7000,
      rails: { top: 'PROGRAM FLOW', bottom: 'LIVE SCHEDULE BOARD' },
      payload: {
        now: 'COR SESSION',
        next: 'DIG AFTER DARK',
      },
    },
    roomchange: {
      type: SCENE_TYPES.ROOM,
      name: 'Room Change',
      dwellMs: 7000,
      visualMode: 'accent',
      payload: {
        title: 'ROOM CHANGE',
        room: 'CONTINENTAL 6',
        detail: 'CHECK APP FOR MAP',
      },
    },
    countdown: {
      type: SCENE_TYPES.COUNTDOWN,
      name: 'Countdown',
      dwellMs: 1000,
      visualMode: 'accent',
      payload: {
        title: 'OPENING CEREMONY',
        label: 'STARTS IN',
        targetIso: '2026-06-20T19:00:00-07:00',
      },
    },
    sponsor: {
      type: SCENE_TYPES.SPONSOR,
      name: 'Sponsors',
      dwellMs: 8000,
      payload: {
        title: 'THANK YOU SPONSORS',
        lines: ['CIVIC CLOUD', 'TRANSITLAB', 'OPEN SIGNAL'],
      },
    },
    wayfinding: {
      type: SCENE_TYPES.WAYFINDING,
      name: 'Wayfinding',
      dwellMs: 7000,
      payload: {
        title: 'WAYFINDING',
        direction: 'WORKSHOPS > PIER NORTH',
        detail: 'BADGE CHECK AT ENTRY',
      },
    },
    alertCapacity: {
      type: SCENE_TYPES.ALERT,
      name: 'Capacity Alert',
      dwellMs: 6000,
      visualMode: 'warn',
      rails: { top: 'VENUE OPERATIONS ALERT', bottom: 'FOLLOW STAFF DIRECTION' },
      payload: {
        title: 'ALERT',
        message: 'GRAND HALL AT CAPACITY',
        detail: 'USE OVERFLOW * MARKET EAST',
      },
    },
  },
};
