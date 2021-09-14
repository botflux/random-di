import {SyncServiceFactory, ServiceKey} from '../Interfaces'

/**
 * @deprecated
 */
export abstract class FactoryRegistry {
    constructor(protected readonly factoriesMap: Map<ServiceKey, SyncServiceFactory<unknown>>) {
    }

    abstract getFactory<TService>(serviceKey: ServiceKey): SyncServiceFactory<TService> | undefined;

    has = (serviceKey: ServiceKey) => this.factoriesMap.has(serviceKey)
}

/**
 * @deprecated
 */
class TransientFactoryRegistry extends FactoryRegistry {
    getFactory<TService>(serviceKey: ServiceKey): SyncServiceFactory<TService> | undefined {
        const factory = this.factoriesMap.get(serviceKey)

        if (!factory)
            return undefined

        return factory as SyncServiceFactory<TService>
    }
}

/**
 * @deprecated
 */
type ResolvedServicesMap = Map<ServiceKey, unknown>

/**
 * @deprecated
 */
class SingletonFactoryRegistry extends FactoryRegistry {
    private readonly resolvedSingletons: ResolvedServicesMap =
        new Map<ServiceKey, unknown>()

    wrapFactory(key: ServiceKey, factory: SyncServiceFactory<unknown>): SyncServiceFactory<unknown> {
        return container => {
            if (!this.resolvedSingletons.has(key)) {
                this.resolvedSingletons.set(key, factory(container))
            }

            return this.resolvedSingletons.get(key)
        }
    }

    getFactory<TService>(serviceKey: ServiceKey): SyncServiceFactory<TService> | undefined {
        const factory = this.factoriesMap.get(serviceKey)

        if (!factory)
            return undefined

        return this.wrapFactory(serviceKey, factory) as SyncServiceFactory<TService>
    }
}

/**
 * @deprecated
 * @param factoriesMap
 */
export const createSingletonFactoryRegistry = (factoriesMap: Map<ServiceKey, SyncServiceFactory<unknown>>) =>
    new SingletonFactoryRegistry(factoriesMap)

/**
 * @deprecated
 * @param factoriesMap
 */
export const createTransientFactoryRegistry = (factoriesMap: Map<ServiceKey, SyncServiceFactory<unknown>>) =>
    new TransientFactoryRegistry(factoriesMap)
