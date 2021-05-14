import {
    AsyncServiceProviderInterface,
    ContainerInterface,
    ServiceKey, ServiceNotFoundError,
    SyncServiceProviderInterface
} from '../Interfaces'

class SyncServiceProvider implements SyncServiceProviderInterface {
    constructor(private readonly innerContainer: ContainerInterface) {}

    has(key: ServiceKey): boolean {
        return this.innerContainer.has(key)
    }
    get<T>(key: ServiceKey): T {
        return this.innerContainer.get(key)
    }
}

class CombinedSyncServiceProvider implements SyncServiceProviderInterface {
    constructor(private readonly providers: SyncServiceProviderInterface[]) {}

    get<TService>(key: ServiceKey): TService {
        const provider = this.providers.find(p => p.has(key))

        if (!provider) {
            throw new ServiceNotFoundError(key)
        }

        return provider.get(key)
    }

    has(key: ServiceKey): boolean {
        return this.providers.find(p => p.has(key)) !== undefined
    }
}

class AsyncServiceProvider implements AsyncServiceProviderInterface {
    private readonly syncProvider: SyncServiceProviderInterface

    constructor(private readonly innerContainer: ContainerInterface) {
        this.syncProvider = new SyncServiceProvider(innerContainer)
    }

    get<TService>(key: ServiceKey): TService {
        return this.syncProvider.get(key);
    }

    getAsync<TService>(key: ServiceKey): Promise<TService> {
        return this.innerContainer.getAsync(key)
    }

    has(key: ServiceKey): boolean {
        return this.syncProvider.has(key)
    }

    hasAsync(key: ServiceKey): boolean {
        return this.innerContainer.hasAsync(key)
    }
}

class CombinedAsyncServiceProvider implements AsyncServiceProviderInterface {
    constructor(private readonly providers: AsyncServiceProviderInterface[]) {}

    get<TService>(key: ServiceKey): TService {
        const provider = this.providers.find(p => p.has(key))

        if (!provider) {
            throw new ServiceNotFoundError(key)
        }

        return provider.get<TService>(key)
    }

    getAsync<TService>(key: ServiceKey): Promise<TService> {
        const provider = this.providers.find(p => p.hasAsync(key))

        if (!provider) {
            return Promise.reject(new ServiceNotFoundError(key))
        }

        return provider.getAsync<TService>(key)
    }

    has(key: ServiceKey): boolean {
        return this.providers.find(p => p.has(key)) !== undefined
    }

    hasAsync(key: ServiceKey): boolean {
        return this.providers.find(p => p.hasAsync(key)) !== undefined
    }
}

export const createSyncServiceProvider = (container: ContainerInterface) =>
    new SyncServiceProvider(container)

export const createCombinedSyncServiceProvider = (providers: SyncServiceProviderInterface[]) =>
    new CombinedSyncServiceProvider(providers)

export const createCombinedAsyncServiceProvider = (providers: AsyncServiceProviderInterface[]) =>
    new CombinedAsyncServiceProvider(providers)

export const createAsyncServiceProvider = (container: ContainerInterface) =>
    new AsyncServiceProvider(container)
