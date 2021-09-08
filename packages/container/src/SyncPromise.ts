/**
 * Represents a mapping operation for a SyncPromise.
 */
export type SyncPromiseOperation<T, U> = (value: T) => U

/**
 * Sync Promise is just a promise that can be unwrapped.
 * We use this class in order to treat async and sync operation the same way.
 */
export class SyncPromise<T> implements PromiseLike<T> {
    constructor(private readonly value: T) {
    }

    // /**
    //  * Transform the wrapped value.
    //  * @param operation
    //  */
    // then<U>(operation: SyncPromiseOperation<T, U>): SyncPromise<U> {
    //     return new SyncPromise<U>(operation(this.value))
    // }

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

    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => (PromiseLike<TResult1> | TResult1)) | undefined | null,
        onrejected?: ((reason: any) => (PromiseLike<TResult2> | TResult2)) | undefined | null
    ): PromiseLike<TResult1 | TResult2> {
        if (onfulfilled) {
            const result = onfulfilled(this.value)

            if (typeof result === 'object' && 'then' in result) {
                return result
            } else {
                return new SyncPromise<TResult1>(result)
            }
        }

        throw new Error('you must pass a onfulfilled callback')
    }

    static all<T1, T2> (a: PromiseLike<T1>, b: PromiseLike<T2>): PromiseLike<[T1, T2]> {
        if (a instanceof SyncPromise && b instanceof SyncPromise) {
            return new SyncPromise<[T1, T2]>([ a.unwrap(), b.unwrap() ])
        } else {
            return Promise.all([ a, b ])
        }
    }
}
