import { BAR_COUNT } from './constants.js';

export function mountPillDom() {
  const root = document.getElementById('root');

  const moduleNode = document.createElement('div');
  moduleNode.className = 'module';
  moduleNode.id = 'module';

  const ring = document.createElement('div');
  ring.className = 'processing-ring';
  moduleNode.appendChild(ring);

  const visualizer = document.createElement('div');
  visualizer.className = 'visualizer';

  const bars = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar idle';
    visualizer.appendChild(bar);
    bars.push(bar);
  }
  moduleNode.appendChild(visualizer);
  root.appendChild(moduleNode);

  return { moduleNode, bars };
}
