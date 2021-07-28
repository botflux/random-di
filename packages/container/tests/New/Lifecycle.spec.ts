import { ServiceKey } from "../../src"

type Seconds = number

type ValidateCachedServiceCallback<T> = (service: T) => boolean
type SingletonLifeCycle<T> = { type: 'Singleton', onRetrieve: ValidateCachedServiceCallback<T> }
type SemiTransientLifeCycle = { type: 'SemiTransient', timeBetweenRefresh: Seconds }

type LifeCycleKind<T> = 'Transient' | 'Singleton' | SemiTransientLifeCycle | SingletonLifeCycle<T>

export const LifeCycle = {
    Transient: 'Transient' as LifeCycleKind<unknown>,
    Singleton: { type: 'Singleton', onRetrieve: () => true } as LifeCycleKind<unknown>,

    newSemiTransient: (timeBetweenRefresh: Seconds): LifeCycleKind<unknown> => ({ type: 'SemiTransient', timeBetweenRefresh }),

    newSingleton: <T>(onRetrieve: ValidateCachedServiceCallback<T>): LifeCycleKind<T> => ({
        type: 'Singleton',
        onRetrieve
    })
}

const isSingleton = (lifeCycle: LifeCycleKind<any>): lifeCycle is 'Singleton' => lifeCycle === 'Singleton'
const isAltSingleton = (lifeCycle: LifeCycleKind<any>): lifeCycle is SingletonLifeCycle<any> => typeof lifeCycle === 'object' && lifeCycle.type === 'Singleton'
const isSemiTransient = (lifeCycle: LifeCycleKind<any>): lifeCycle is SemiTransientLifeCycle => typeof lifeCycle === 'object' && lifeCycle.type === 'SemiTransient'

export interface ServiceStorageInterface {
    getOrInstantiate<T> (identifier: ServiceKey, lifeCycle: any, func: () => T, now?: Date): T
}

class ServiceStorage implements ServiceStorageInterface {
    constructor(
        private readonly singletonMap: Map<ServiceKey, any> = new Map(),
        private readonly semiTransientMap: Map<ServiceKey, { lastRefreshTime: Date, value: any }> = new Map()
    ) {}

    getOrInstantiate<T>(identifier: ServiceKey, lifeCycle: LifeCycleKind<T>, func: () => T, now?: Date): T {
        if (isAltSingleton(lifeCycle)) {
            const cachedResult = this.singletonMap.get(identifier)

            const isCached = cachedResult !== null && cachedResult !== undefined
            const isCacheResultValid = isCached && lifeCycle.onRetrieve(cachedResult)

            const reloadedCachedResult = isCached && !isCacheResultValid
                ? func()
                : cachedResult

            const result = reloadedCachedResult ?? func()
            this.singletonMap.set(identifier, result)
            return result
        }

        if (isSingleton(lifeCycle)) {
            const cachedResult = this.singletonMap.get(identifier)
            const result = cachedResult ?? func()

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
        const lifeCycle = LifeCycle.newSingleton<number>(n => n === 2)
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

    it('should instantiate semi-transient one time for a given time', () => {
        // Arrange
        let i = 0
        const lifeCycle = LifeCycle.newSemiTransient(240)
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
        const lifeCycle = LifeCycle.newSemiTransient(240)
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
})
