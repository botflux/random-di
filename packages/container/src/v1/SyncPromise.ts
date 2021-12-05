
export class NullFulfilledCallbackError extends Error {
    constructor() {
        super("You must pass a fulfilled callback in order to chain sync promise.")
    }
}

/**
 * Sync Promise is just a promise that can be unwrapped.
 * We use this class in order to treat async and sync operation the same way.
 */
export class SyncPromise<T> implements PromiseLike<T> {
    constructor(private readonly value: T) {}

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

        throw new NullFulfilledCallbackError()
    }

    static all<T1, T2> (a: PromiseLike<T1>, b: PromiseLike<T2>): PromiseLike<[T1, T2]> {
        if (a instanceof SyncPromise && b instanceof SyncPromise) {
            return new SyncPromise<[T1, T2]>([ a.unwrap(), b.unwrap() ])
        } else {
            return Promise.all([ a, b ])
        }
    }

    static allWithoutTypeChecking (params: any[]): PromiseLike<any[]> {
        const hasAsync = params.some(maybePromise => maybePromise instanceof Promise)

        return hasAsync
            ? Promise.all(params.map(promise => promise instanceof SyncPromise ? promise.unwrap() : promise))
            : new SyncPromise(params.map(param => param instanceof SyncPromise ? param.unwrap() : param))
    }

    static fromSyncOrAsync<T> (value: T): Promise<T> | SyncPromise<T> {
        if (value instanceof Promise) {
            return value
        } else {
            return SyncPromise.from(value)
        }
    }
}

/**
 * Returns true when the given {@see PromiseLike} is a {@see SyncPromise}; otherwise false.
 *
 * @param value
 */
export const isSyncPromise = <T>(value: PromiseLike<T>): value is SyncPromise<T> =>
    value instanceof SyncPromise

export const unwrapIfSyncPromise = <T> (value: PromiseLike<T> | Promise<T>): T | Promise<T> =>
    value instanceof SyncPromise ? value.unwrap() : value
