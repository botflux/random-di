import {
    SyncServiceFactory,
    ServiceKey,
    SyncServiceFactoryOptions,
    AsyncServiceFactoryOptions
} from '../Interfaces'

export abstract class FactoryRegistry {
    constructor(protected readonly factoriesMap: Map<ServiceKey, SyncServiceFactoryOptions<unknown> | AsyncServiceFactoryOptions<unknown>>) {}

    abstract getFactory<TService>(serviceKey: ServiceKey): SyncServiceFactory<TService> | AsyncServiceFactoryOptions<TService> | undefined;
    abstract clear(): Promise<void>

    has = (serviceKey: ServiceKey) => this.factoriesMap.has(serviceKey)
}

class TransientFactoryRegistry extends FactoryRegistry {
    getFactory<TService>(serviceKey: ServiceKey): SyncServiceFactory<TService> | AsyncServiceFactoryOptions<TService> | undefined {
        const factory = this.factoriesMap.get(serviceKey)

        if (!factory)
            return undefined

        return factory.factory as (SyncServiceFactory<TService> | AsyncServiceFactoryOptions<TService>)
    }

    clear(): Promise<void> {
        return Promise.resolve(undefined);
    }
}

type ResolvedServicesMap = Map<ServiceKey, unknown>

class SingletonFactoryRegistry extends FactoryRegistry {
    private readonly resolvedSingletons: ResolvedServicesMap =
        new Map<ServiceKey, unknown>()

    wrapFactory(key: ServiceKey, options: SyncServiceFactoryOptions<unknown> | AsyncServiceFactoryOptions<unknown>): SyncServiceFactory<unknown> | AsyncServiceFactoryOptions<unknown> {
        return container => {
            if (!this.resolvedSingletons.has(key)) {
                const { factory } = options

                // @ts-ignore
                this.resolvedSingletons.set(key, factory(container))
            }

            return this.resolvedSingletons.get(key)
        }
    }

    getFactory<TService>(serviceKey: ServiceKey): SyncServiceFactory<TService> | AsyncServiceFactoryOptions<TService> | undefined {
        const factory = this.factoriesMap.get(serviceKey)

        if (!factory)
            return undefined

        return this.wrapFactory(serviceKey, factory) as (SyncServiceFactory<TService> | AsyncServiceFactoryOptions<TService>)
    }

    async clear(): Promise<void> {
        for (const [serviceKey, instance] of this.resolvedSingletons.entries()) {
            await this.factoriesMap.get(serviceKey)?.clear(instance)
        }
    }
}

export const createSingletonFactoryRegistry = (factoriesMap: Map<ServiceKey, SyncServiceFactoryOptions<unknown> | AsyncServiceFactoryOptions<unknown>>) =>
    new SingletonFactoryRegistry(factoriesMap)

export const createTransientFactoryRegistry = (factoriesMap: Map<ServiceKey, SyncServiceFactoryOptions<unknown> | AsyncServiceFactoryOptions<unknown>>) =>
    new TransientFactoryRegistry(factoriesMap)
