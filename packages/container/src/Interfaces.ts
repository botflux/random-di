/**
 * Manage your application dependencies
 */
export interface ContainerInterface {
    /**
     * Get a sync service with its uniq identifier.
     *
     * @param key
     */
    get<T>(key: ServiceKey): T

    /**
     * Get an async service with its uniq identifier.
     * @param key
     */
    getAsync<T>(key: ServiceKey): Promise<T>

    /**
     * Return true if there is a sync service matching the given key; otherwise false.
     *
     * @param key
     */
    has(key: ServiceKey): boolean

    /**
     * Return true if there is an async service matching the given key; otherwise false.
     *
     * @param key
     */
    hasAsync(key: ServiceKey): boolean
}

export type ServiceKey = string | Symbol | number
export type SyncServiceFactory<TService> = (provider: SyncServiceProviderInterface) => TService
export type AsyncServiceFactory<TService> = (provider: AsyncServiceProviderInterface) => TService
export type ServiceFactory<TService> = AsyncServiceFactory<TService> | SyncServiceFactory<TService>
export type ServiceConstructor<TService> = { new(...args: any[]): TService }

/**
 * Helps container creation.
 */
export interface ContainerBuilderInterface {
    /**
     * Add a new sync factory to the container.
     * The services registered with this method can only access sync services.
     *
     * @param key A uniq key to identify your service
     * @param factory A function creating your service instance
     * @param lifeCycle The lifecycle of your service
     */
    addFactory<TService>(key: ServiceKey, factory: SyncServiceFactory<TService>, lifeCycle?: LifeCycle): this

    /**
     * Add a new sync constructor to the container.
     * This function is the same as `addFactory` but for constructor.
     * The services registered with this method can only access sync services.
     *
     * @param key A uniq key to identify your service.
     * @param constructor Your service's constructor
     * @param lifeCycle The lifecycle of your service
     */
    addConstructor<TConstructor>(key: ServiceKey, constructor: ServiceConstructor<TConstructor>, lifeCycle?: LifeCycle): this

    /**
     * Add a new async factory to the container.
     * The services registered with this method can access both sync and async services.
     *
     * @param key
     * @param factory
     * @param lifeCycle
     */
    addAsyncFactory<TService>(key: ServiceKey, factory: AsyncServiceFactory<Promise<TService>>, lifeCycle?: LifeCycle): this

    /**
     * Create a new DI container from your current configuration.
     */
    build(): ContainerInterface
}

export interface SyncServiceProviderInterface {
    get<TService>(key: ServiceKey): TService
    has(key: ServiceKey): boolean
}

export interface AsyncServiceProviderInterface extends SyncServiceProviderInterface {
    getAsync<TService>(key: ServiceKey): Promise<TService>
    hasAsync(key: ServiceKey): boolean
}

export enum LifeCycle {
    Transient,
    Singleton,
}

/**
 * Thrown when you add an already registered service.
 */
export class ServiceAlreadyRegisteredError extends Error {
    constructor(serviceKey: ServiceKey) {
        super(`Service with key "${serviceKey}" was already registered.`);
    }
}

/**
 * Thrown when you try to access an non-existing service.
 */
export class ServiceNotFoundError extends Error {
    constructor(serviceKey: ServiceKey) {
        super(`No service matching key "${typeof serviceKey === 'symbol' ? serviceKey.toString() : serviceKey}" found.`);
    }
}

export type ServiceLoaderInterface = (containerBuilder: ContainerBuilderInterface) => void
