import { ServiceKey } from "../../src"

/**
 * Represents time in seconds.
 */
type Seconds = number

/**
 * Returns the type wrapped in the given promise.
 * If T is not a promise, T is returned.
 *
 * @example
 * ```typescript
 * type A = Promise<number>
 * type B = number
 *
 * type C = Unpromisify<A> // number
 * type D = Unpromisify<B> // number
 * ```
 */
type Unpromisify<T> = T extends Promise<infer U> ? U : T

/**
 * A predicate to know if the given service if valid or not.
 */
type InvalidateCachedSingleton<T> = (service: T) => boolean

/**
 * A function that refresh a singleton.
 * E.g reconnect a database connection.
 */
type RefreshCachedSingleton<T> = (service: T) => T

/**
 * Represents a singleton lifecycle.
 * A singleton is created only one time.
 *
 * You can renew a singleton instance by using the invalidate predicate.
 * If this predicate returns true then the service factory will be called and the current instance will be thrown.
 *
 * You can also provide a custom refresh function to re-new the singleton service.
 */
type SingletonLifeCycle<T> = { type: 'Singleton', invalidate: InvalidateCachedSingleton<Unpromisify<T>>, refresh?: RefreshCachedSingleton<Unpromisify<T>> }

/**
 * Represents a semi transient lifecycle.
 * A semi-transient is created one time for a given time.
 *
 * You can specify the lifetime of a semi-transient by using the timeBetweenRefresh parameter.
 */
type SemiTransientLifeCycle = { type: 'SemiTransient', timeBetweenRefresh: Seconds }

/**
 * All possible service lifecycle.
 */
type LifeCycleKind<T> = 'Transient' | SemiTransientLifeCycle | SingletonLifeCycle<T>

/**
 * Default singleton parameters used by the singleton factory.
 */
const defaultSingleton: SingletonLifeCycle<any> = {
    type: 'Singleton',
    invalidate: () => false,
    refresh: undefined
}

/**
 * Default semi-transient parameters used by the semi-transient factory.
 */
const defaultSemiTransient: SemiTransientLifeCycle = {
    type: 'SemiTransient',
    timeBetweenRefresh: 0
}

/**
 * Create a new semi transient lifecycle.
 *
 * @param lifeCycle
 * @see SemiTransientLifeCycle
 */
const createSemiTransient = (lifeCycle: Partial<Omit<SemiTransientLifeCycle, 'type'>>): LifeCycleKind<any> => ({
    ...defaultSemiTransient,
    ...lifeCycle
})

/**
 * Create a new singleton lifecycle.
 *
 * @param lifeCycle
 * @see SingletonLifeCycle
 * @see LifeCycle.Singleton
 */
const createSingleton = <T>(lifeCycle: Partial<Omit<SingletonLifeCycle<T>, 'type'>>): LifeCycleKind<T> => ({
    ...defaultSingleton,
    ...lifeCycle
})

export const LifeCycle = {
    Transient: 'Transient' as LifeCycleKind<unknown>,
    Singleton: defaultSingleton as LifeCycleKind<unknown>,

    newSemiTransient: createSemiTransient,
    newSingleton: createSingleton
}


const isSingleton = (lifeCycle: LifeCycleKind<any>): lifeCycle is SingletonLifeCycle<any> =>
    typeof lifeCycle === 'object' && lifeCycle.type === 'Singleton'

const isSemiTransient = (lifeCycle: LifeCycleKind<any>): lifeCycle is SemiTransientLifeCycle =>
    typeof lifeCycle === 'object' && lifeCycle.type === 'SemiTransient'

/**
 * Instantiate and store services.
 *
 * @see ServiceStorageInterface#getOrInstantiate
 * @see createServiceStorage
 */
export interface ServiceStorageInterface {
    /**
     * Instantiate a service or retrieve it from cache.
     *
     * @param identifier
     * @param lifeCycle
     * @param func
     * @param now
     */
    getOrInstantiate<T> (identifier: ServiceKey, lifeCycle: any, func: () => T, now?: Date): T
}

/**
 * A service storage using a Map to store services instances.
 */
class ServiceStorage implements ServiceStorageInterface {
    constructor(
        private readonly singletonMap: Map<ServiceKey, any> = new Map(),
        private readonly semiTransientMap: Map<ServiceKey, { lastRefreshTime: Date, value: any }> = new Map()
    ) {}

    /**
     * Reload cached singleton instances.
     * This method helps to handle async service.
     *
     * @param lifeCycle
     * @param func
     * @param singleton
     * @private
     */
    private reloadCachedSingleton<T> (lifeCycle: SingletonLifeCycle<T>, func: () => T, singleton: T): T {
        const refreshSingleton = lifeCycle.refresh
            ? lifeCycle.refresh
            : () => func()

        if (singleton instanceof Promise) {
            return singleton
                .then(innerSingleton => [innerSingleton, lifeCycle.invalidate(innerSingleton)])
                .then(([innerSingleton, isInvalidate]) => isInvalidate ? refreshSingleton(innerSingleton) : innerSingleton) as unknown as T
        } else {
            const isInvalid = lifeCycle.invalidate(singleton as Unpromisify<T>)
            // @ts-ignore
            return (isInvalid ? refreshSingleton(singleton) : singleton)
        }
    }

    getOrInstantiate<T>(identifier: ServiceKey, lifeCycle: LifeCycleKind<T>, func: () => T, now?: Date): T {
        if (isSingleton(lifeCycle)) {
            const cachedResult = this.singletonMap.get(identifier)

            const isCached = cachedResult !== null && cachedResult !== undefined
            // const isCacheResultValid = isCached && lifeCycle.onRetrieve(cachedResult)

            const reloadedCachedResult = isCached
                ? this.reloadCachedSingleton(lifeCycle, func, cachedResult)
                : cachedResult

            const result = reloadedCachedResult ?? func()
            this.singletonMap.set(identifier, result)
            return result
        }

        if (isSemiTransient(lifeCycle)) {
            const localNow = now ?? new Date()

            const cachedResult = this.semiTransientMap.get(identifier)
            const result = cachedResult ?? { lastRefreshTime: localNow, value: func() }

            const nextRefreshTime = new Date( result.lastRefreshTime.valueOf() + (lifeCycle.timeBetweenRefresh * 1000) )
            const refreshedResult = nextRefreshTime.valueOf() <= localNow.valueOf()
                ? { lastRefreshTime: localNow, value: func() }
                : result

            this.semiTransientMap.set(identifier, refreshedResult)
            return refreshedResult.value
        }

        return func()
    }
}

const createServiceStorage = (): ServiceStorageInterface => new ServiceStorage()

describe('service lifecycle management', () => {
    it('should instantiate transient for each request', () => {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.Transient
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++
        )

        // Assert
        expect(service1).toBe(0)
        expect(service2).toBe(1)
    })

    it('should instantiate singleton one time for all request', () => {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.Singleton
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++
        )

        // Assert
        expect(service1).toBe(0)
        expect(service2).toBe(0)
    })

    it('should re-instantiate a singleton if the invalidate predicate returns true', function () {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.newSingleton<number>({
            invalidate: n => n !== 2
        })
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++
        )

        // Assert
        expect(service1).toBe(0)
        expect(service2).toBe(1)
    })

    it('should use a callback to repair invalidate singleton instance', function () {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.newSingleton({
            invalidate: service => service !== 1,
            refresh: service => 3
        })
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++
        )

        // Assert
        expect(service1).toBe(0)
        expect(service2).toBe(3)
        expect(service3).toBe(3)
    })

    it('should instantiate semi-transient one time for a given time', () => {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.newSemiTransient({
            timeBetweenRefresh: 240
        })
        const serviceStorage = createServiceStorage()

        const t0 = new Date('2021-05-23T10:25:00Z')
        const t1 = new Date('2021-05-23T10:26:00Z')
        const t2 = new Date('2021-05-23T10:29:00Z')

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++,
            t0
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++,
            t1
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => i++,
            t2
        )

        // Assert
        expect(service1).toBe(0)
        expect(service2).toBe(0)
        expect(service3).toBe(1)
    })

    it('should instantiate transient promise each time', async function () {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.Transient
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        // Assert
        await expect(service1).resolves.toBe(0)
        await expect(service2).resolves.toBe(1)
    })

    it('should instantiate singleton promise one time for all', async function () {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.Singleton
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        // Assert
        await expect(service1).resolves.toBe(0)
        await expect(service2).resolves.toBe(0)
    })

    it('should instantiate semi-transient promise one time for a given time', async () => {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.newSemiTransient({
            timeBetweenRefresh: 240
        })
        const serviceStorage = createServiceStorage()

        const t0 = new Date('2021-05-23T10:25:00Z')
        const t1 = new Date('2021-05-23T10:26:00Z')
        const t2 = new Date('2021-05-23T10:29:00Z')

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++),
            t0
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++),
            t1
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++),
            t2
        )

        // Assert
        await expect(service1).resolves.toBe(0)
        await expect(service2).resolves.toBe(0)
        await expect(service3).resolves.toBe(1)
    })

    it('should re-instantiate singleton service if an invalid predicate returns true', async () => {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.newSingleton({
            invalidate: n => n !== 2
        })
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        const service4 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        // Assert
        await expect(service1).resolves.toBe(0)
        await expect(service2).resolves.toBe(1)
        await expect(service3).resolves.toBe(2)
        await expect(service4).resolves.toBe(2)
    })

    it('should unwrap the promise if the refresh callback returns a promise', async function () {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.newSingleton({
            invalidate: n => n !== 2,
            refresh: n => Promise.resolve(2)
        })
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        const service4 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            () => Promise.resolve(i++)
        )

        // Assert
        await expect(service1).resolves.toBe(0)
        await expect(service2).resolves.toBe(2)
        await expect(service3).resolves.toBe(2)
        await expect(service4).resolves.toBe(2)
    })
})
