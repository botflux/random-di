import { ServiceKey } from "../../src"
import {DbConnection, HttpService} from '../Services'

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
 * A function that destroy a cached singleton instance.
 * E.g disconnect from a database.
 */
type DestroyCachedSingleton<T> = (service: T) => void | Promise<void>

/**
 * Represents a singleton lifecycle.
 * A singleton is created only one time.
 *
 * You can renew a singleton instance by using the invalidate predicate.
 * If this predicate returns true then the service factory will be called and the current instance will be thrown.
 *
 * You can also provide a custom refresh function to re-new the singleton service.
 */
type SingletonLifeCycle<T> = {
    type: 'Singleton',
    invalidate: InvalidateCachedSingleton<Unpromisify<T>>,
    refresh?: RefreshCachedSingleton<Unpromisify<T>>,
    destroy: DestroyCachedSingleton<Unpromisify<T>>
}

/**
 * All possible service lifecycle.
 */
export type LifeCycleKind<T> = 'Transient' | SingletonLifeCycle<T>

/**
 * Default singleton parameters used by the singleton factory.
 */
const defaultSingleton: SingletonLifeCycle<any> = {
    type: 'Singleton',
    invalidate: () => false,
    refresh: undefined,
    destroy: () => undefined
}

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
    Transient: 'Transient' as LifeCycleKind<any>,
    Singleton: defaultSingleton as LifeCycleKind<any>,

    newSingleton: createSingleton
}


const isSingleton = (lifeCycle: LifeCycleKind<any>): lifeCycle is SingletonLifeCycle<any> =>
    typeof lifeCycle === 'object' && lifeCycle.type === 'Singleton'

/**
 * Instantiate and store services.
 *
 * Classes implementing this interface are responsible for
 * instantiating and storing services.
 *
 * @see ServiceStorageInterface#getOrInstantiate
 * @see createServiceStorage
 * @see LifeCycle
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

    /**
     * Destroy all stored services instances.
     */
    destroyAll(): Promise<void>
}

/**
 * Returns true if the passed value is not null nor undefined; otherwise false.
 *
 * @param v
 */
const isNotNullNorUndefined = <T> (v: T | undefined | null): v is T =>
    v !== null && v !== undefined

/**
 * A service storage using a Map to store services instances.
 */
class ServiceStorage implements ServiceStorageInterface {
    constructor(
        private readonly singletonMap: Map<ServiceKey, { value: any, destroy: DestroyCachedSingleton<any> }> = new Map(),
        private readonly semiTransientMap: Map<ServiceKey, { lastRefreshTime: Date, value: any, destroy: DestroyCachedSingleton<any> }> = new Map()
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

            const reloadedCachedResult = isNotNullNorUndefined(cachedResult)
                ? this.reloadCachedSingleton(lifeCycle, func, cachedResult.value)
                : cachedResult

            const result = reloadedCachedResult ?? func()
            this.singletonMap.set(identifier, { value: result, destroy: lifeCycle.destroy })
            return result
        }

        return func()
    }

    async destroyAll(): Promise<void> {
        const storedServicesEntries = [
            ...this.singletonMap.entries(),
            ...this.semiTransientMap.entries()
        ]

        for (const [ , { destroy, value } ] of storedServicesEntries) {
            await Promise.resolve(value)
                .then(instance => destroy(instance))
        }
    }
}

/**
 * Create a new service storage.
 *
 * @see ServiceStorageInterface
 */
const createServiceStorage = (): ServiceStorageInterface => new ServiceStorage()

describe('service lifecycle management', () => {

    describe('transient lifecycle', function () {
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
    })

    describe('singleton lifecycle', function () {
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

        it('should destroy the cached singleton instances when the service storage is destroyed', async function () {
            // Arrange
            const factory = () => {
                const connection = new DbConnection()
                connection.disconnect = jest.fn(connection.disconnect)
                return connection
            }

            const lifeCycle = LifeCycle.newSingleton<DbConnection>({
                destroy: connection => connection.disconnect()
            })

            const serviceStorage = createServiceStorage()

            // Act
            const service = serviceStorage.getOrInstantiate('connection', lifeCycle, factory)
            await serviceStorage.destroyAll()

            // Assert
            expect(service.disconnect).toBeCalledTimes(1)
            expect(service._isConnected).toBe(false)
        })

        it('should destroy the cached singleton instances using an async destroy function', async function () {
            // Arrange
            const factory = () => {
                const connection = new DbConnection()
                connection.disconnect = jest.fn(connection.disconnect)
                return connection
            }

            const lifeCycle = LifeCycle.newSingleton<DbConnection>({
                destroy: connection => new Promise(resolve => {
                    connection.disconnect()
                    resolve(undefined)
                })
            })

            const serviceStorage = createServiceStorage()

            // Act
            const service = serviceStorage.getOrInstantiate('connection', lifeCycle, factory)
            await serviceStorage.destroyAll()

            // Assert
            expect(service.disconnect).toBeCalledTimes(1)
            expect(service._isConnected).toBe(false)
        })
    })

    describe('transient lifecycle with async service', function () {
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
    })

    describe('singleton lifecycle with async service', function () {
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
        it('should repair the async service with an async refresh callback', async function () {
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
                refresh: service => new Promise(resolve => {
                    service.connect()
                    return resolve(service)
                })
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
        it('should destroy the cached singleton async instances when the service storage is destroyed', async function () {
            // Arrange
            const factory = jest.fn(async () => {
                const connection = new DbConnection()
                connection.disconnect = jest.fn(connection.disconnect)
                return connection
            })
            const lifeCycle = LifeCycle.newSingleton<Promise<DbConnection>>({
                destroy: connection => connection.disconnect()
            })
            const serviceStorage = createServiceStorage()

            // Act
            const service1 = serviceStorage.getOrInstantiate(
                'my-service',
                lifeCycle,
                factory
            )

            await serviceStorage.destroyAll()

            // Assert
            expect(factory).toBeCalledTimes(1)
            expect((await service1).disconnect).toBeCalledTimes(1)
        })
        it('should destroy the cached singleton async instances with an async destroy callback', async function() {
            // Arrange
            const factory = jest.fn(async () => {
                const connection = new DbConnection()
                connection.disconnect = jest.fn(connection.disconnect)
                return connection
            })
            const lifeCycle = LifeCycle.newSingleton<Promise<DbConnection>>({
                destroy: async connection => connection.disconnect()
            })
            const serviceStorage = createServiceStorage()

            // Act
            const service1 = serviceStorage.getOrInstantiate(
                'my-service',
                lifeCycle,
                factory
            )

            await serviceStorage.destroyAll()

            // Assert
            expect(factory).toBeCalledTimes(1)
            expect((await service1).disconnect).toBeCalledTimes(1)
        })
    })
})
