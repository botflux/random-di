import {
    ContainerBuilderInterface,
    ContainerInterface,
    LifeCycle,
    ServiceConstructor,
    SyncServiceFactory,
    ServiceKey, AsyncServiceFactory, ServiceNotFoundError, AsyncServiceProviderInterface, SyncServiceProviderInterface
} from '../Interfaces'
import {createContainerBuilder, CreateContainerBuilderOptions} from './Container'
import {
    createAsyncServiceProvider, createCombinedAsyncServiceProvider,
    createCombinedSyncServiceProvider,
    createSyncServiceProvider
} from './ServiceProvider'

/**
 * @deprecated
 */
class ScopedContainer implements ContainerInterface {
    constructor(
        private readonly parentContainer: ContainerInterface,
        private readonly innerContainer: ContainerInterface,
    ) {
    }

    /**
     * @deprecated
     */
    get<T>(key: ServiceKey): T {
        if (!this.parentContainer.has(key) && !this.innerContainer.has(key)) {
            throw new ServiceNotFoundError(key)
        }

        const parentProvider = createSyncServiceProvider(this.parentContainer)
        const innerProvider = createSyncServiceProvider(this.innerContainer)
        const combinedProvider = createCombinedSyncServiceProvider([ parentProvider, innerProvider ])

        return combinedProvider.get(key)
    }

    /**
     * @deprecated
     */
    getAsync<T>(key: ServiceKey): Promise<T> {
        if (!this.parentContainer.hasAsync(key) && !this.innerContainer.hasAsync(key)) {
            throw new ServiceNotFoundError(key)
        }

        const parentProvider = createAsyncServiceProvider(this.parentContainer)
        const innerProvider = createAsyncServiceProvider(this.innerContainer)
        const combinedProvider = createCombinedAsyncServiceProvider([ parentProvider, innerProvider ])

        return combinedProvider.getAsync(key)
    }

    /**
     * @deprecated
     */
    has(key: ServiceKey): boolean {
        return this.parentContainer.has(key) || this.innerContainer.has(key)
    }

    /**
     * @deprecated
     */
    hasAsync(key: ServiceKey): boolean {
        return this.parentContainer.hasAsync(key) || this.innerContainer.hasAsync(key)
    }
}

/**
 * @deprecated
 */
class ScopedContainerBuilder implements ContainerBuilderInterface {
    private readonly builder: ContainerBuilderInterface

    /**
     * @deprecated
     */
    constructor(private readonly innerContainer: ContainerInterface, options: CreateContainerBuilderOptions) {
        this.builder = createContainerBuilder(options,
            container => createCombinedSyncServiceProvider([ this.innerContainer, container ]),
            container => createCombinedAsyncServiceProvider([ this.innerContainer, container ])
        )
    }

    /**
     * @deprecated
     */
    addConstructor<TConstructor>(key: ServiceKey, constructor: ServiceConstructor<TConstructor>, lifeCycle: LifeCycle): this {
        this.builder.addConstructor(key, constructor, lifeCycle)
        return this
    }

    /**
     * @deprecated
     */
    addFactory<TService>(key: ServiceKey, factory: SyncServiceFactory<TService>, lifeCycle: LifeCycle): this {
        this.builder.addFactory(key, factory, lifeCycle)
        return this
    }

    /**
     * @deprecated
     */
    addAsyncFactory<TService>(key: ServiceKey, factory: AsyncServiceFactory<Promise<TService>>, lifeCycle: LifeCycle): this {
        this.builder.addAsyncFactory(key, factory, lifeCycle)
        return this
    }

    /**
     * @deprecated
     */
    build(): ContainerInterface {
        return new ScopedContainer(this.innerContainer, this.builder.build())
    }

}

/**
 * @deprecated
 */
export const createScopedContainerBuilder = (container: ContainerInterface, options: CreateContainerBuilderOptions = { loaders: [] }) =>
    new ScopedContainerBuilder(container, options)
