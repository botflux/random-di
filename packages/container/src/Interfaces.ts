export interface ContainerInterface {
    get<T>(key: ServiceKey): T
    getAsync<T>(key: ServiceKey): Promise<T>

    has(key: ServiceKey): boolean
    hasAsync(key: ServiceKey): boolean

    clear(): Promise<void>
}

export type ServiceKey = string | Symbol | number
export type SyncServiceFactory<TService> = (provider: SyncServiceProviderInterface) => TService
export type AsyncServiceFactory<TService> = (provider: AsyncServiceProviderInterface) => TService
export type ServiceFactory<TService> = AsyncServiceFactory<TService> | SyncServiceFactory<TService>
export type ServiceConstructor<TService> = { new(...args: any[]): TService }

export type ClearServiceFunction<TService> = (service: TService) => Promise<void>

export type SyncServiceFactoryOptions<TService> = {
    factory: SyncServiceFactory<TService>,
    clear: ClearServiceFunction<TService>
}

export type AsyncServiceFactoryOptions<TService> = {
    factory: AsyncServiceFactory<TService>
    clear: ClearServiceFunction<TService>
}

export type ServiceConstructorOptions<TService> = {
    constructor: ServiceConstructor<TService>
    clear: ClearServiceFunction<TService>
}

export interface ContainerBuilderInterface {
    addFactory<TService>(
        key: ServiceKey,
        factory: SyncServiceFactory<TService> | SyncServiceFactoryOptions<TService>,
        lifeCycle: LifeCycle
    ): this

    addConstructor<TConstructor>(
        key: ServiceKey,
        constructor: ServiceConstructor<TConstructor> | ServiceConstructorOptions<TConstructor>,
        lifeCycle: LifeCycle
    ): this

    addAsyncFactory<TService>(
        key: ServiceKey,
        factory: AsyncServiceFactory<Promise<TService>> | AsyncServiceFactoryOptions<Promise<TService>>,
        lifeCycle: LifeCycle
    ): this

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

export class ServiceAlreadyRegisteredError extends Error {
    constructor(serviceKey: ServiceKey) {
        super(`Service with key "${serviceKey}" was already registered.`);
    }
}

export class ServiceNotFoundError extends Error {
    constructor(serviceKey: ServiceKey) {
        super(`No service matching key "${typeof serviceKey === 'symbol' ? serviceKey.toString() : serviceKey}" found.`);
    }
}

export type ServiceLoaderInterface = (containerBuilder: ContainerBuilderInterface) => void
