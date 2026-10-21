import './styles.css';
import { Game } from './game/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
// Exposed for automated browser tests and debugging from the console.
(window as unknown as { __game: Game }).__game = game;
void game.init();
