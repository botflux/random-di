import {
    AsyncServiceFactory,
    AsyncServiceFactoryOptions,
    AsyncServiceProviderInterface,
    ContainerBuilderInterface,
    ContainerInterface,
    LifeCycle,
    ServiceAlreadyRegisteredError,
    ServiceConstructor,
    ServiceConstructorOptions,
    ServiceKey,
    ServiceLoaderInterface,
    ServiceNotFoundError,
    SyncServiceFactory,
    SyncServiceFactoryOptions,
    SyncServiceProviderInterface,
} from '../Interfaces'
import {createSingletonFactoryRegistry, createTransientFactoryRegistry, FactoryRegistry} from './FactoryRegistry'
import {createAsyncServiceProvider, createSyncServiceProvider} from './ServiceProvider'

const isFunction = (value: unknown): value is Function => typeof value === 'function'

class Container implements ContainerInterface {

    private readonly syncFactoriesRegistry =
        new Map<LifeCycle, FactoryRegistry>()

    private readonly asyncFactoriesRegistry =
        new Map<LifeCycle, FactoryRegistry>()

    constructor(
        syncSingletonFactories: Map<ServiceKey, SyncServiceFactoryOptions<unknown>>,
        syncTransientFactories: Map<ServiceKey, SyncServiceFactoryOptions<unknown>>,
        asyncSingletonFactories: Map<ServiceKey, AsyncServiceFactoryOptions<unknown>>,
        asyncTransientFactories: Map<ServiceKey, AsyncServiceFactoryOptions<unknown>>,
        protected readonly createSyncServiceProvider: (containerInterface: ContainerInterface) => SyncServiceProviderInterface,
        protected readonly createAsyncServiceProvider: (containerInterface: ContainerInterface) => AsyncServiceProviderInterface
    ) {
        this.syncFactoriesRegistry.set(LifeCycle.Singleton, createSingletonFactoryRegistry(syncSingletonFactories))
        this.syncFactoriesRegistry.set(LifeCycle.Transient, createTransientFactoryRegistry(syncTransientFactories))
        this.asyncFactoriesRegistry.set(LifeCycle.Singleton, createSingletonFactoryRegistry(asyncSingletonFactories))
        this.asyncFactoriesRegistry.set(LifeCycle.Transient, createTransientFactoryRegistry(asyncTransientFactories))
    }

    get<T>(key: ServiceKey): T {
        const serviceFactory = this.syncFactoriesRegistry.get(LifeCycle.Singleton)?.getFactory(key)
            || this.syncFactoriesRegistry.get(LifeCycle.Transient)?.getFactory(key)

        if (!serviceFactory)
            throw new ServiceNotFoundError(key)

        // @ts-ignore
        return serviceFactory(this.createSyncServiceProvider(this))
    }

    async getAsync<T>(key: ServiceKey): Promise<T> {
        const serviceFactory = this.asyncFactoriesRegistry.get(LifeCycle.Singleton)?.getFactory(key)
            || this.asyncFactoriesRegistry.get(LifeCycle.Transient)?.getFactory(key)

        if (!serviceFactory)
            throw new ServiceNotFoundError(key)

        // @ts-ignore
        return serviceFactory(this.createAsyncServiceProvider(this))
    }

    has(key: ServiceKey): boolean {
        return this.syncFactoriesRegistry.get(LifeCycle.Singleton)?.has(key)
            || this.syncFactoriesRegistry.get(LifeCycle.Transient)?.has(key)
            || false
    }

    hasAsync(key: ServiceKey): boolean {
        return this.asyncFactoriesRegistry.get(LifeCycle.Singleton)?.has(key)
            || this.asyncFactoriesRegistry.get(LifeCycle.Transient)?.has(key)
            || false
    }

    async clear(): Promise<void> {
        await this.syncFactoriesRegistry.get(LifeCycle.Singleton)?.clear()
        await this.asyncFactoriesRegistry.get(LifeCycle.Singleton)?.clear()
    }
}

class ContainerBuilder implements ContainerBuilderInterface {
    private readonly syncFactories =
        new Map<LifeCycle, Map<ServiceKey, SyncServiceFactoryOptions<unknown>>>()
            .set(LifeCycle.Singleton, new Map())
            .set(LifeCycle.Transient, new Map())

    private readonly asyncFactories =
        new Map<LifeCycle, Map<ServiceKey, AsyncServiceFactoryOptions<Promise<unknown>>>>()
            .set(LifeCycle.Singleton, new Map())
            .set(LifeCycle.Transient, new Map())

    constructor(options: CreateContainerBuilderOptions,
                private readonly createProvider: (containerInterface: ContainerInterface) => SyncServiceProviderInterface = createSyncServiceProvider,
                private readonly createAsyncProvider: (containerInterface: ContainerInterface) => AsyncServiceProviderInterface = createAsyncServiceProvider
    ) {
        options.loaders.forEach(loader => loader(this))
    }

    addFactory<TService>(key: ServiceKey, factory: SyncServiceFactory<TService> | SyncServiceFactoryOptions<TService>, lifeCycle: LifeCycle): this {
        if (this.isAlreadyRegistered(key))
            throw new ServiceAlreadyRegisteredError(key)

        const factoryOptions: SyncServiceFactoryOptions<TService> = isFunction(factory)
            ? { factory, clear: () => Promise.resolve() }
            : factory

        this.syncFactories.get(lifeCycle)?.set(key, factoryOptions as SyncServiceFactoryOptions<unknown>)

        return this
    }

    build(): ContainerInterface {
        return new Container(
            this.syncFactories.get(LifeCycle.Singleton) || new Map(),
            this.syncFactories.get(LifeCycle.Transient) || new Map(),
            this.asyncFactories.get(LifeCycle.Singleton) || new Map(),
            this.asyncFactories.get(LifeCycle.Transient) || new Map(),
            this.createProvider,
            this.createAsyncProvider
        )
    }

    addConstructor<TConstructor>(key: ServiceKey, constructor: ServiceConstructor<TConstructor> | ServiceConstructorOptions<TConstructor>, lifeCycle: LifeCycle): this {
        const factoryOptions: SyncServiceFactoryOptions<TConstructor> = isFunction(constructor)
            ? { factory: container => new constructor(container), clear: () => Promise.resolve() }
            : { factory: container => new constructor.constructor(container), clear: constructor.clear }

        this.syncFactories.get(lifeCycle)?.set(key, factoryOptions as SyncServiceFactoryOptions<unknown>)
        return this
    }

    addAsyncFactory<TService>(key: ServiceKey, factory: AsyncServiceFactory<Promise<TService>> | AsyncServiceFactoryOptions<Promise<TService>>, lifeCycle: LifeCycle): this {
        if (this.isAlreadyRegistered(key))
            throw new ServiceAlreadyRegisteredError(key)

        const factoryOptions: AsyncServiceFactoryOptions<Promise<TService>> = isFunction(factory)
            ? { factory, clear: () => Promise.resolve() }
            : factory

        this.asyncFactories.get(lifeCycle)?.set(key, factoryOptions as AsyncServiceFactoryOptions<Promise<unknown>>)
        return this
    }

    isAlreadyRegistered(key: ServiceKey): boolean {
        return this.asyncFactories.get(LifeCycle.Transient)?.has(key)
            || this.asyncFactories.get(LifeCycle.Singleton)?.has(key)
            || this.syncFactories.get(LifeCycle.Transient)?.has(key)
            || this.syncFactories.get(LifeCycle.Singleton)?.has(key)
            || false
    }
}

export type CreateContainerBuilderOptions = { loaders: ServiceLoaderInterface[] }
const defaultOptions = { loaders: [] }

export const createContainerBuilder = (options: CreateContainerBuilderOptions = defaultOptions,
                                       createProvider: (containerInterface: ContainerInterface) => SyncServiceProviderInterface = createSyncServiceProvider,
                                       createAsyncProvider: (containerInterface: ContainerInterface) => AsyncServiceProviderInterface = createAsyncServiceProvider) =>
    new ContainerBuilder(options, createProvider, createAsyncProvider)
