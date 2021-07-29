import { ServiceKey } from "../../src"
import {DbConnection, HttpService} from '../Services'

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
type RefreshCachedSingleton<T> = (service: T) => T | Promise<T>

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
    getOrInstantiate<T> (identifier: ServiceKey, lifeCycle: LifeCycleKind<T>, func: () => T, now?: Date): T
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
        const lifeCycle = LifeCycle.Transient
        const factory = () => new HttpService()
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        // Assert
        expect(service1).toBeInstanceOf(HttpService)
        expect(service2).toBeInstanceOf(HttpService)
        expect(service1).not.toBe(service2)
    })

    it('should instantiate singleton one time for all request', () => {
        // Arrange
        const lifeCycle = LifeCycle.Singleton
        const factory = () => new HttpService()
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        // Assert
        expect(service1).toBeInstanceOf(HttpService)
        expect(service2).toBeInstanceOf(HttpService)
        expect(service1).toBe(service2)
    })

    it('should re-instantiate a singleton if the invalidate predicate returns true', function () {
        // Arrange
        const lifeCycle = LifeCycle.newSingleton<DbConnection>({
            invalidate: service => !service.isConnected()
        })

        const factory = jest.fn(() => {
            const dbConnection = new DbConnection()

            dbConnection.isConnected = jest.fn()
                .mockReturnValueOnce(false)

            return dbConnection
        })

        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        // Assert
        expect(service1).toBeInstanceOf(DbConnection)
        expect(service2).toBeInstanceOf(DbConnection)
        expect(factory).toBeCalledTimes(2)
    })

    it('should use a callback to repair invalidate singleton instance', function () {
        // Arrange
        const factory = jest.fn(() => {
            const dbConnection = new DbConnection()

            dbConnection.isConnected = jest.fn()
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false)

            dbConnection.connect = jest.fn(dbConnection.connect)

            return dbConnection
        })
        const lifeCycle = LifeCycle.newSingleton<DbConnection>({
            invalidate: service => service.isConnected(),
            refresh: service => {
                service.connect()
                return service
            }
        })
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        // Assert
        expect(service1).toBeInstanceOf(DbConnection)
        expect(service2).toBeInstanceOf(DbConnection)
        expect(service3).toBeInstanceOf(DbConnection)

        expect(service1).toBe(service2)
        expect(service2).toBe(service3)

        expect(service1.connect).toBeCalledTimes(1)
        expect(service1.isConnected).toBeCalledTimes(2)
    })

    it('should instantiate semi-transient one time for a given time', () => {
        // Arrange
        const factory = jest.fn(() => new HttpService())
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
            factory,
            t0
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory,
            t1
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory,
            t2
        )

        // Assert
        expect(service1).toBeInstanceOf(HttpService)
        expect(service2).toBeInstanceOf(HttpService)
        expect(service3).toBeInstanceOf(HttpService)

        expect(service1).toBe(service2)
        expect(service1).not.toBe(service3)
        expect(service2).not.toBe(service3)
    })

    it('should instantiate transient promise each time', async function () {
        // Arrange
        const factory = jest.fn(async () => new HttpService())
        const lifeCycle = LifeCycle.Transient
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        // Assert
        expect(await service1).not.toBe(await service2)
        expect(factory).toBeCalledTimes(2)
    })

    it('should instantiate singleton promise one time for all', async function () {
        // Arrange
        const factory = jest.fn(async () => new DbConnection())
        const lifeCycle = LifeCycle.Singleton
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        // Assert
        expect(await service1).toBe(await service2)
        expect(factory).toBeCalledTimes(1)
    })

    it('should instantiate semi-transient promise one time for a given time', async () => {
        // Arrange
        const factory = jest.fn(async () => new HttpService())
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
            factory,
            t0
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory,
            t1
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory,
            t2
        )

        // Assert
        expect(await service1).toBe(await service2)
        expect(await service2).not.toBe(await service3)
        expect(await service1).not.toBe(await service3)
        expect(factory).toBeCalledTimes(2)
    })

    it('should re-instantiate singleton service if an invalid predicate returns true', async () => {
        // Arrange
        const isConnected = jest.fn()
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true)

        const factory = jest.fn(async () => {
            const connection = new DbConnection()

            connection.isConnected = isConnected
            return connection
        })

        const lifeCycle = LifeCycle.newSingleton<Promise<DbConnection>>({
            invalidate: s => !s.isConnected()
        })

        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service4 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        // Assert
        expect(await service1).not.toBe(await service2)
        expect(await service2).not.toBe(await service3)
        expect(await service1).not.toBe(await service3)
        expect(await service3).toBe(await service4)
        expect(factory).toBeCalledTimes(3)
        expect(isConnected).toBeCalledTimes(3)
    })

    it('should unwrap the promise if the refresh callback returns a promise', async function () {
        // Arrange
        const factory = jest.fn(async () => {
            const connection = new DbConnection()

            connection.isConnected = jest.fn()
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true)
            connection.connect = jest.fn(connection.connect)

            return connection
        })
        const lifeCycle = LifeCycle.newSingleton<Promise<DbConnection>>({
            invalidate: service => !service.isConnected(),
            refresh: service => {
                service.connect()
                return service
            }
        })
        const serviceStorage = createServiceStorage()

        // Act
        const service1 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service2 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service3 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        const service4 = serviceStorage.getOrInstantiate(
            'my-service',
            lifeCycle,
            factory
        )

        // Assert
        expect(await service1).toBe(await service2)
        expect(await service2).toBe(await service3)
        expect(await service3).toBe(await service4)
        expect(await service4).toBe(await service1)

        expect(factory).toBeCalledTimes(1)
        expect((await service1).isConnected).toBeCalledTimes(3)
        expect((await service1).connect).toBeCalledTimes(1)
    })
})
