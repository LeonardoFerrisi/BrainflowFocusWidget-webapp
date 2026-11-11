import { parentPort, workerData } from 'worker_threads';
import { BoardShim } from 'brainflow';

const { boardId, inputParams } = workerData as {
  boardId: number;
  inputParams: Record<string, unknown>;
};

try {
  const board = new BoardShim(boardId, inputParams);
  board.prepareSession();
  board.startStream();
  parentPort!.postMessage({ ok: true });
} catch (e) {
  parentPort!.postMessage({ ok: false, error: (e as Error).message });
}
