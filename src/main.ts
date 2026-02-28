/// <reference types="vite/client" />
import { Game } from './Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
new Game(canvas);
