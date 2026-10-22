import './styles.css';
import { Game } from './game/Game';

const container = document.getElementById('app')!;
try {
  const game = new Game(container);
  game.start();
  document.getElementById('boot')?.remove();
} catch (err) {
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'WebGL başlatılamadı / Could not start WebGL: ' + (err as Error).message;
  throw err;
}
