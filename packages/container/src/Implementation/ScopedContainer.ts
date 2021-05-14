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

class ScopedContainer implements ContainerInterface {
    constructor(
        private readonly parentContainer: ContainerInterface,
        private readonly innerContainer: ContainerInterface,
    ) {
    }

    get<T>(key: ServiceKey): T {
        if (!this.parentContainer.has(key) && !this.innerContainer.has(key)) {
            throw new ServiceNotFoundError(key)
        }

        const parentProvider = createSyncServiceProvider(this.parentContainer)
        const innerProvider = createSyncServiceProvider(this.innerContainer)
        const combinedProvider = createCombinedSyncServiceProvider([ parentProvider, innerProvider ])

        return combinedProvider.get(key)
    }

    getAsync<T>(key: ServiceKey): Promise<T> {
        if (!this.parentContainer.hasAsync(key) && !this.innerContainer.hasAsync(key)) {
            throw new ServiceNotFoundError(key)
        }

        const parentProvider = createAsyncServiceProvider(this.parentContainer)
        const innerProvider = createAsyncServiceProvider(this.innerContainer)
        const combinedProvider = createCombinedAsyncServiceProvider([ parentProvider, innerProvider ])

        return combinedProvider.getAsync(key)
    }

    has(key: ServiceKey): boolean {
        return this.parentContainer.has(key) || this.innerContainer.has(key)
    }

    hasAsync(key: ServiceKey): boolean {
        return this.parentContainer.hasAsync(key) || this.innerContainer.hasAsync(key)
    }
}

class ScopedContainerBuilder implements ContainerBuilderInterface {
    private readonly builder: ContainerBuilderInterface

    constructor(private readonly innerContainer: ContainerInterface, options: CreateContainerBuilderOptions) {
        this.builder = createContainerBuilder(options,
            container => createCombinedSyncServiceProvider([ this.innerContainer, container ]),
            container => createCombinedAsyncServiceProvider([ this.innerContainer, container ])
        )
    }

    addConstructor<TConstructor>(key: ServiceKey, constructor: ServiceConstructor<TConstructor>, lifeCycle: LifeCycle): this {
        this.builder.addConstructor(key, constructor, lifeCycle)
        return this
    }

    addFactory<TService>(key: ServiceKey, factory: SyncServiceFactory<TService>, lifeCycle: LifeCycle): this {
        this.builder.addFactory(key, factory, lifeCycle)
        return this
    }

    addAsyncFactory<TService>(key: ServiceKey, factory: AsyncServiceFactory<Promise<TService>>, lifeCycle: LifeCycle): this {
        this.builder.addAsyncFactory(key, factory, lifeCycle)
        return this
    }

    build(): ContainerInterface {
        return new ScopedContainer(this.innerContainer, this.builder.build())
    }

}

export const createScopedContainerBuilder = (container: ContainerInterface, options: CreateContainerBuilderOptions = { loaders: [] }) =>
    new ScopedContainerBuilder(container, options)
