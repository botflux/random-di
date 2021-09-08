/**
 * Represents a mapping operation for a SyncPromise.
 */
export type SyncPromiseOperation<T, U> = (value: T) => U

/**
 * Sync Promise is just a promise that can be unwrapped.
 * We use this class in order to treat async and sync operation the same way.
 */
export class SyncPromise<T> {
    constructor(private readonly value: T) {
    }

    /**
     * Transform the wrapped value.
     * @param operation
     */
    then<U>(operation: SyncPromiseOperation<T, U>): SyncPromise<U> {
        return new SyncPromise<U>(operation(this.value))
    }

    /**
     * Return the wrapped value.
     */
    unwrap(): T {
        return this.value
    }

    /**
     * Create a new SyncPromise from a given value.
     * @param value
     */
    static from<T>(value: T): SyncPromise<T> {
        return new SyncPromise<T>(value)
    }
}
