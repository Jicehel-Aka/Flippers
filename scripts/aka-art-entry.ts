// Point d'entrée navigateur du générateur d'images AKA (voir gen-aka-art.mjs).
import { PinballCanvasRenderer } from '../src/engine/renderer';
import { PINBALL_TABLES } from '../src/data/tables';

(window as unknown as Record<string, unknown>).__akaArt = {
  ids: PINBALL_TABLES.map((t) => t.id),
  render(index: number): number[] {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 520;
    const ctx = canvas.getContext('2d')!;
    new PinballCanvasRenderer().renderTableArtwork(ctx, PINBALL_TABLES[index].id);
    return Array.from(ctx.getImageData(0, 0, 240, 520).data);
  },
};
