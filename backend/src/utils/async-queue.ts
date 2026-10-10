/**
 * A promise chain that runs one operation at a time.
 *
 * Used by the repositories to serialise read-modify-write cycles on a shared JSON
 * document: without it, two concurrent requests could each read the same array,
 * allocate the same business id and then overwrite one another's write.
 *
 * A rejected operation never poisons the queue - the next caller still runs.
 */
export class AsyncQueue {
  private tail: Promise<unknown> = Promise.resolve();

  /** Queues `operation` behind everything already enqueued and returns its result. */
  run<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    // `.then(operation, operation)` runs the operation whether the previous
    // entry resolved or rejected.
    const result = this.tail.then(operation, operation);

    this.tail = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }
}
